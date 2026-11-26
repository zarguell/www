"""Route rendering for every page on the site."""

from __future__ import annotations

import datetime as dt
import json
import re
from typing import Any

import jinja2
from markdown_it import MarkdownIt

from .config import Paths, load_site
from .content import (
    flatten_tools,
    latest_post,
    load_colophon,
    load_links,
    load_page,
    load_posts,
    load_tools,
    newest_tool,
    reading_minutes,
    word_count,
)
from .render import clean_markdown_html, make_env, make_markdown


class SiteBuilder:
    def __init__(self, paths: Paths, asset_map: dict[str, str]):
        self.paths = paths
        self.site = load_site(paths)
        self.env = make_env(paths.templates, self.site, asset_map)
        self.md: MarkdownIt = make_markdown()
        self.posts = load_posts(paths)
        self.tool_categories = load_tools(paths)
        self.tools = flatten_tools(self.tool_categories)
        self.links = load_links(paths)
        self.colophon = load_colophon(paths)
        self.routes: list[str] = []

        for post in self.posts:
            post.html = clean_markdown_html(self.md.render(post.body))
            # The page title is the only h1; demote headings written in the post body.
            post.html = re.sub(
                r"<h1(\s[^>]*)?>(.*?)</h1>",
                r"<h2\1>\2</h2>",
                post.html,
                flags=re.S,
            )
            post.word_count = word_count(post.body)
            post.reading_time = reading_minutes(post.body)

    @staticmethod
    def raw_markdown_path(path: str) -> str | None:
        if path == "/":
            return "/index.md"
        if path in {"/about/", "/links/", "/blog/"} or path.startswith("/blog/"):
            return f"{path}index.md"
        return None

    def context(
        self,
        path: str,
        title: str,
        description: str,
        *,
        og_image: str | None = None,
        og_type: str = "website",
        **extra: Any,
    ) -> dict[str, Any]:
        canonical = f"{self.site['url'].rstrip('/')}{path}"
        image = og_image or "/og-default.png"
        if image.startswith("/"):
            image = f"{self.site['url'].rstrip('/')}{image}"
        return {
            "page": {
                "path": path,
                "title": title,
                "description": description,
                "canonical": canonical,
                "markdown": self.raw_markdown_path(path),
                "og_image": image,
                "og_type": og_type,
            },
            "site": self.site,
            **extra,
        }

    def write(self, route: str, html: str) -> None:
        if route.endswith(".xml") or route.endswith(".txt"):
            target = self.paths.dist / route.lstrip("/")
        elif route.endswith("/"):
            target = self.paths.dist / route.lstrip("/") / "index.html"
        else:
            target = self.paths.dist / route.lstrip("/") / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html, encoding="utf-8")
        self.routes.append(route if route.endswith((".xml", ".txt")) else route)

    def render(self, template: str, context: dict[str, Any]) -> str:
        return self.env.get_template(template).render(context)

    def write_raw(self, route: str, content: str) -> None:
        target = self.paths.dist / route.lstrip("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def absolute_markdown_links(self, markdown: str) -> str:
        return re.sub(
            r"\]\((/(?!/)[^)\s]+)\)",
            lambda match: f"]({self.site['url'].rstrip('/')}{match.group(1)})",
            markdown,
        )

    @staticmethod
    def demote_h1(markdown: str) -> str:
        lines: list[str] = []
        in_fence = False
        for line in markdown.splitlines():
            if line.lstrip().startswith("```"):
                in_fence = not in_fence
            elif not in_fence and line.startswith("# "):
                line = "## " + line[2:]
            lines.append(line)
        return "\n".join(lines)

    def raw_page(self, path: str, title: str, description: str, body: str) -> str:
        origin = self.site["url"].rstrip("/")
        canonical = f"{origin}{path}"
        markdown_path = "/index.md" if path == "/" else f"{path}index.md"
        markdown_url = f"{origin}{markdown_path}"
        return (
            "---\n"
            f"title: {json.dumps(title, ensure_ascii=False)}\n"
            f"description: {json.dumps(description, ensure_ascii=False)}\n"
            f"url: {canonical}\n"
            f"markdown: {markdown_url}\n"
            "---\n\n"
            f"# {title}\n\n"
            f"{self.absolute_markdown_links(body).strip()}\n"
        )

    def build_home(self) -> None:
        page = load_page(self.paths, "home")
        body_html = clean_markdown_html(self.md.render(page.body))
        latest = latest_post(self.posts)
        newest = newest_tool(self.tools)
        ctx = self.context(
            "/",
            f"{self.site['name']} — {self.site['tagline']}",
            self.site["description"],
            home=page,
            body_html=body_html,
            latest_post=latest,
            newest_tool=newest,
            hero_image="/assets/images/hero-portrait.jpg",
        )
        self.write("/", self.render("pages/home.html", ctx))

    def build_blog_index(self) -> None:
        ctx = self.context(
            "/blog/",
            f"Blog — {self.site['name']}",
            "Notes on homelab, automation, and the systems I keep breaking.",
            posts=self.posts,
            all_tags=sorted({tag for post in self.posts for tag in post.tags}),
        )
        self.write("/blog/", self.render("pages/blog_index.html", ctx))

    def build_posts(self) -> None:
        for post in self.posts:
            related = [other for other in self.posts if other.slug != post.slug][:2]
            ctx = self.context(
                f"/blog/{post.slug}/",
                f"{post.title} — {self.site['name']}",
                post.description,
                post=post,
                related=related,
                has_mermaid="```mermaid" in post.body,
                has_timeline="```timeline" in post.body,
                og_image=post.image,
                og_type="article",
            )
            self.write(f"/blog/{post.slug}/", self.render("pages/blog_post.html", ctx))

    def build_about(self) -> None:
        page = load_page(self.paths, "about")
        body_html = clean_markdown_html(self.md.render(page.body))
        ctx = self.context(
            "/about/",
            f"About — {self.site['name']}",
            self.site["description"],
            about=page,
            body_html=body_html,
            colophon=self.colophon,
            about_image="/assets/images/about-portrait.jpg",
        )
        self.write("/about/", self.render("pages/about.html", ctx))

    def build_links(self) -> None:
        ctx = self.context(
            "/links/",
            f"Links — {self.site['name']}",
            "Curated corners of the internet: socials, projects, and cool finds.",
            links=self.links,
            tags=sorted({tag for item in self.links["coolFinds"] for tag in item["tags"]}),
        )
        self.write("/links/", self.render("pages/links.html", ctx))

    def build_tools_index(self) -> None:
        ctx = self.context(
            "/tools/",
            f"Tools — {self.site['name']}",
            "Calculators and utilities for your digital life. Everything runs in your browser.",
            categories=self.tool_categories,
            tools=self.tools,
            tags=sorted({tool["badge"] for tool in self.tools}),
        )
        self.write("/tools/", self.render("pages/tools_index.html", ctx))

    def build_tool_pages(self) -> None:
        tool_og = {
            "cocktail-recipe": "/assets/cocktail-og.jpg",
            "perquackey": "/assets/perquackey-og.jpg",
        }
        for tool in self.tools:
            slug = tool.get("slug")
            if not slug:
                continue
            template = f"tools/{slug}.html"
            try:
                self.env.get_template(template)
            except jinja2.TemplateNotFound as exc:
                raise FileNotFoundError(f"missing tool template: {template}") from exc
            related = [
                other
                for other in self.tools
                if other.get("slug") and other["slug"] != slug and other["category_id"] == tool["category_id"]
            ][:3]
            ctx = self.context(
                f"/tools/{slug}/",
                f"{tool['title']} — {self.site['name']}",
                tool["description"],
                tool=tool,
                related=related,
                og_image=tool_og.get(slug),
                has_tool_css=(self.paths.assets / "css" / "tools" / f"{slug}.css").exists(),
            )
            self.write(f"/tools/{slug}/", self.render(template, ctx))

    def build_styleguide(self) -> None:
        ctx = self.context(
            "/styleguide/",
            f"Styleguide — {self.site['name']}",
            "The type, color, and component system behind arguelles.me.",
            code_sample=(
                "function createBetter() {\n"
                "  return {\n"
                "    focus: true,\n"
                "    iterate: true,\n"
                "  };\n"
                "}"
            ),
        )
        self.write("/styleguide/", self.render("pages/styleguide.html", ctx))

    def build_404(self) -> None:
        page = load_page(self.paths, "404")
        ctx = self.context(
            "/404.html",
            f"404 — {self.site['name']}",
            "The page you requested does not exist.",
            page_404=page,
        )
        html = self.render("pages/404.html", ctx)
        target = self.paths.dist / "404.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html, encoding="utf-8")
        self.routes.append("/404.html")

    def build_llms(self) -> None:
        base = self.site["url"].rstrip("/")
        home = load_page(self.paths, "home")
        about = load_page(self.paths, "about")

        home_body = (
            home.body
            + "\n\n## Explore\n\n"
            + f"- [Blog]({base}/blog/index.md)\n"
            + f"- [About]({base}/about/index.md)\n"
            + f"- [Links]({base}/links/index.md)\n\n"
            + "Interactive tools and other browser-only pages are intentionally "
            + "excluded from the agent-readable pages.\n"
        )
        colophon = "\n\n## Colophon\n\n" + "\n".join(
            f"- **{row['label']}:** {row['value']}" for row in self.colophon
        )
        self.write_raw(
            "/index.md",
            self.raw_page("/", home.meta["title"], self.site["description"], home_body),
        )
        self.write_raw(
            "/about/index.md",
            self.raw_page("/about/", about.meta["title"], self.site["description"], about.body + colophon),
        )

        links_lines = [
            "---",
            f"title: {json.dumps('Links', ensure_ascii=False)}",
            f"description: {json.dumps('Curated corners of the internet: socials, projects, and cool finds.', ensure_ascii=False)}",
            f"url: {base}/links/",
            f"markdown: {base}/links/index.md",
            "---",
            "",
            "# Links",
            "",
        ]
        for category in self.links["categories"]:
            links_lines.append(f"## {category['name']}")
            links_lines.append("")
            for item in category["links"]:
                links_lines.append(f"- [{item['title']}]({item['url']}) — {item['description']}")
            links_lines.append("")
        links_lines.append("## Cool finds")
        links_lines.append("")
        for item in self.links["coolFinds"]:
            tags = ", ".join(item["tags"])
            links_lines.append(
                f"- [{item['title']}]({item['url']}) — {item['description']} ({tags}; {item['date']})"
            )
        self.write_raw("/links/index.md", "\n".join(links_lines).rstrip() + "\n")

        blog_lines = [
            "---",
            f"title: {json.dumps('Blog', ensure_ascii=False)}",
            f"description: {json.dumps('Notes on homelab, automation, and the systems I keep breaking.', ensure_ascii=False)}",
            f"url: {base}/blog/",
            f"markdown: {base}/blog/index.md",
            "---",
            "",
            "# Blog",
            "",
        ]
        for post in self.posts:
            blog_lines.append(
                f"- [{post.title}]({base}/blog/{post.slug}/index.md): {post.pub_date.isoformat()} — {post.description}"
            )
        self.write_raw("/blog/index.md", "\n".join(blog_lines).rstrip() + "\n")

        for post in self.posts:
            body = self.demote_h1(post.body)
            front = (
                "---\n"
                f"title: {json.dumps(post.title, ensure_ascii=False)}\n"
                f"description: {json.dumps(post.description, ensure_ascii=False)}\n"
                f"url: {base}/blog/{post.slug}/\n"
                f"markdown: {base}/blog/{post.slug}/index.md\n"
                f"pubDate: {post.pub_date.isoformat()}\n"
                + (f"pubTime: {json.dumps(post.pub_time, ensure_ascii=False)}\n" if post.pub_time else "")
                + f"tags: {json.dumps(post.tags, ensure_ascii=False)}\n"
                + (f"image: {json.dumps(base + post.image, ensure_ascii=False)}\n" if post.image else "")
                + "---\n\n"
                f"# {post.title}\n\n"
            )
            self.write_raw(f"/blog/{post.slug}/index.md", front + self.absolute_markdown_links(body).strip() + "\n")

        index = [
            f"# {self.site['name']}",
            "",
            f"> {self.site['description']}",
            "",
            "This is a static personal site. The links below point at plain Markdown "
            "versions of the pages. Interactive tools and other browser-only pages "
            "are intentionally excluded because their value is interactive rather "
            "than textual. Each Markdown file carries the canonical HTML URL in its "
            "front matter.",
            "",
            "## Pages",
            "",
            f"- [Home]({base}/index.md): {self.site['description']}",
            f"- [About]({base}/about/index.md): Bio and how this site is built.",
            f"- [Links]({base}/links/index.md): Social links, projects, and cool finds.",
            f"- [Blog]({base}/blog/index.md): Notes on homelab, automation, and security.",
            "",
            "## Blog posts",
            "",
        ]
        for post in self.posts:
            index.append(f"- [{post.title}]({base}/blog/{post.slug}/index.md): {post.pub_date.isoformat()} — {post.description}")
        index += [
            "",
            "## Optional",
            "",
            f"- [RSS]({base}/rss.xml): Full-text feed in RSS 2.0",
            f"- [HTML site]({base}/): Human-readable version of the same content",
            "",
        ]
        self.write_raw("/llms.txt", "\n".join(index).rstrip() + "\n")

    def build_rss(self) -> None:
        ctx = {
            "site": self.site,
            "posts": self.posts,
            "build_date": dt.datetime.now(dt.UTC),
        }
        self.write("/rss.xml", self.render("rss.xml", ctx))

    def build_sitemap(self) -> None:
        routes = {
            route
            for route in self.routes
            if not route.endswith((".xml", ".txt")) and route != "/404.html"
        }
        ctx = {"site": self.site, "routes": sorted(routes)}
        self.write("/sitemap.xml", self.render("sitemap.xml", ctx))

    def build_all(self) -> None:
        self.build_home()
        self.build_blog_index()
        self.build_posts()
        self.build_about()
        self.build_links()
        self.build_tools_index()
        self.build_tool_pages()
        self.build_styleguide()
        self.build_404()
        self.build_llms()
        self.build_rss()
        self.build_sitemap()
