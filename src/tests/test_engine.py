"""Engine and output tests. The build is run once for the session."""

from __future__ import annotations

import json
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from engine.config import Paths
from engine.content import load_page, load_posts, split_front_matter
from engine.render import format_date, reading_minutes

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
def site() -> Path:
    subprocess.run([sys.executable, "build.py"], cwd=ROOT, check=True)
    return ROOT / "dist"


def test_front_matter_requires_yaml(tmp_path: Path) -> None:
    source = tmp_path / "x.md"
    with pytest.raises(ValueError, match="missing YAML front matter"):
        split_front_matter("no front matter", source)


def test_front_matter_parses_mapping(tmp_path: Path) -> None:
    source = tmp_path / "x.md"
    meta, body = split_front_matter("---\ntitle: Hi\n---\nBody\n", source)
    assert meta["title"] == "Hi"
    assert body.strip() == "Body"


def test_date_and_read_time() -> None:
    assert format_date("2022-11-24") == "Nov 24, 2022"
    assert reading_minutes("one two three") == 1


def test_blog_posts_have_required_metadata() -> None:
    posts = load_posts(Paths.from_root(ROOT))
    assert len(posts) >= 3
    for post in posts:
        assert post.title
        assert post.description
        assert post.tags
        assert post.image


def test_home_page_loads() -> None:
    page = load_page(Paths.from_root(ROOT), "home")
    assert page.meta["title"] == "Zach Arguelles"


def test_expected_routes_exist(site: Path) -> None:
    expected = [
        "index.html",
        "blog/index.html",
        "blog/cloudflare-ztna/index.html",
        "blog/influxdb-speedtest/index.html",
        "about/index.html",
        "links/index.html",
        "tools/index.html",
        "styleguide/index.html",
        "404.html",
        "rss.xml",
        "sitemap.xml",
        "robots.txt",
    ]
    for route in expected:
        assert (site / route).is_file(), route


def test_external_tool_links_do_not_get_local_pages(site: Path) -> None:
    assert not (site / "tools/browsermark").exists()
    assert not (site / "tools/phishmonger").exists()


def test_no_inline_script_or_style(site: Path) -> None:
    import re

    inline_script = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>", re.I)
    inline_style = re.compile(r"<style\b", re.I)
    handler = re.compile(r"\son[a-z]+\s*=", re.I)
    style_attr = re.compile(r"\sstyle\s*=", re.I)
    for page in site.rglob("*.html"):
        text = page.read_text(encoding="utf-8")
        rel = page.relative_to(site)
        assert not inline_script.search(text), rel
        assert not inline_style.search(text), rel
        assert not handler.search(text), rel
        assert not style_attr.search(text), rel


def test_no_third_party_script_tags(site: Path) -> None:
    import re

    for page in site.rglob("*.html"):
        text = page.read_text(encoding="utf-8")
        for match in re.finditer(r"<script[^>]+src=\"([^\"]+)\"", text):
            src = match.group(1)
            assert src.startswith("/") or src.startswith("data:"), (page, src)


def test_rss_is_well_formed(site: Path) -> None:
    tree = ET.parse(site / "rss.xml")
    root = tree.getroot()
    assert root.tag == "rss"
    items = root.findall("./channel/item")
    assert len(items) >= 3


def test_sitemap_is_well_formed(site: Path) -> None:
    tree = ET.parse(site / "sitemap.xml")
    urls = tree.getroot().findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url")
    assert len(urls) >= 20


def test_tools_json_matches_local_pages(site: Path) -> None:
    categories = json.loads((ROOT / "content" / "tools.json").read_text())
    local = [
        tool
        for category in categories
        for tool in category["tools"]
        if tool.get("slug")
    ]
    assert len(local) >= 20
    for tool in local:
        assert (ROOT / "templates" / "tools" / f"{tool['slug']}.html").is_file(), tool["slug"]
        assert (site / "tools" / tool["slug"] / "index.html").is_file(), tool["slug"]


def test_markdown_fence_renders_code_block() -> None:
    from engine.render import make_markdown

    html = make_markdown().render("```python\nprint('x')\n```")
    assert "code-block" in html
    assert "print" in html


def test_every_css_custom_property_is_defined() -> None:
    import re

    base = (ROOT / "assets" / "css" / "base.css").read_text(encoding="utf-8")
    defined = set(re.findall(r"(--[\w-]+)\s*:", base))
    used: set[str] = set()
    for path in (ROOT / "assets" / "css").rglob("*.css"):
        used.update(re.findall(r"var\(\s*(--[\w-]+)", path.read_text(encoding="utf-8")))
    missing = sorted(used - defined)
    assert not missing, f"undefined CSS custom properties: {missing}"


def test_mermaid_fence_emits_mermaid_pre() -> None:
    from engine.render import make_markdown

    html = make_markdown().render("```mermaid\nsequenceDiagram\n  A->>B: hi\n```")
    assert '<pre class="mermaid">' in html
    assert "sequenceDiagram" in html


def test_timeline_fence_renders_events_and_filters() -> None:
    from engine.render import make_markdown

    html = make_markdown().render(
        "```timeline\n"
        "title: Example timeline\n"
        "10 Jan | First event | `abc`, initial import | release\n"
        "12 Jan | Bad thing | | incident\n"
        "```"
    )
    assert '<section class="timeline"' in html
    assert "Example timeline" in html
    assert html.count("data-timeline-item") == 2
    assert 'data-timeline-filter="release"' in html
    assert 'data-timeline-filter="incident"' in html
    assert "<code>abc</code>" in html


def test_timeline_rejects_malformed_lines() -> None:
    from engine.render import make_markdown

    with pytest.raises(ValueError, match="timeline line 1"):
        make_markdown().render("```timeline\nnot a valid event\n```")


def test_llms_txt_follows_the_standard(site: Path) -> None:
    text = (site / "llms.txt").read_text(encoding="utf-8")
    assert text.startswith("# Zach Arguelles\n")
    assert "\n> " in text
    for section in ("## Pages", "## Blog posts", "## Optional"):
        assert section in text
    assert "/tools/" not in text
    assert "](https://www.arguelles.me/index.md)" in text
    assert "](https://www.arguelles.me/about/index.md)" in text
    assert "](https://www.arguelles.me/links/index.md)" in text
    assert "](https://www.arguelles.me/blog/index.md)" in text
    assert "](https://www.arguelles.me/blog/artex-ai-pentesting/index.md)" in text


def test_raw_markdown_pages_exist(site: Path) -> None:
    for raw in (
        "index.md",
        "about/index.md",
        "links/index.md",
        "blog/index.md",
        "blog/artex-ai-pentesting/index.md",
        "blog/influxdb-speedtest/index.md",
        "blog/cloudflare-ztna/index.md",
    ):
        assert (site / raw).is_file(), raw


def test_raw_post_has_front_matter_and_absolute_links(site: Path) -> None:
    text = (site / "blog/artex-ai-pentesting/index.md").read_text(encoding="utf-8")
    assert text.startswith("---\n")
    assert "url: https://www.arguelles.me/blog/artex-ai-pentesting/" in text
    assert "markdown: https://www.arguelles.me/blog/artex-ai-pentesting/index.md" in text
    assert "# ARTEX: an AI pentest framework" in text
    assert "](/assets/" not in text


def test_blog_post_exposes_agent_markdown_link(site: Path) -> None:
    html = (site / "blog/artex-ai-pentesting/index.html").read_text(encoding="utf-8")
    assert "For agents" in html
    assert 'href="/blog/artex-ai-pentesting/index.md"' in html
    assert 'rel="alternate" type="text/markdown"' in html
    assert 'rel="describedby" href="/llms.txt"' in html


def test_llms_links_resolve_to_emitted_files(site: Path) -> None:
    import re
    from urllib.parse import urlparse

    text = (site / "llms.txt").read_text(encoding="utf-8")
    for url in re.findall(r"\]\((https://www\.arguelles\.me/[^)]*)\)", text):
        path = urlparse(url).path.lstrip("/")
        candidate = site / path
        assert candidate.exists() or (site / path / "index.html").exists(), url


def test_pub_time_breaks_same_day_order(tmp_path: Path) -> None:
    blog = tmp_path / "content" / "blog"
    blog.mkdir(parents=True)
    (blog / "a.md").write_text(
        "---\ntitle: A\ndescription: A\npubDate: 2026-11-17\ntags: []\n---\nBody\n",
        encoding="utf-8",
    )
    (blog / "b.md").write_text(
        "---\ntitle: B\ndescription: B\npubDate: 2026-11-17\npubTime: \"22:01\"\ntags: []\n---\nBody\n",
        encoding="utf-8",
    )
    posts = load_posts(Paths.from_root(tmp_path))
    assert [post.slug for post in posts] == ["b", "a"]
