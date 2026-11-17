"""Post-build assertions: no inline script/style, every internal link resolves."""

from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

INLINE_SCRIPT = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>", re.I)
INLINE_STYLE = re.compile(r"<style\b", re.I)
INLINE_HANDLER = re.compile(r"\son[a-z]+\s*=", re.I)
INLINE_STYLE_ATTR = re.compile(r"\sstyle\s*=", re.I)


class _RefParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.refs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for key, value in attrs:
            if key in {"href", "src"} and value:
                self.refs.append(value)


def validate(paths: Path, site_url: str) -> list[str]:
    problems: list[str] = []
    html_files = sorted(paths.rglob("*.html"))
    if not html_files:
        problems.append("no HTML files were emitted")
    for path in html_files:
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(paths)
        if INLINE_SCRIPT.search(text):
            problems.append(f"{rel}: inline <script>")
        if INLINE_STYLE.search(text):
            problems.append(f"{rel}: inline <style>")
        if INLINE_HANDLER.search(text):
            problems.append(f"{rel}: inline event handler")
        if INLINE_STYLE_ATTR.search(text):
            problems.append(f"{rel}: inline style attribute")

        parser = _RefParser()
        parser.feed(text)
        for ref in parser.refs:
            if ref.startswith(("http://", "https://", "mailto:", "#", "data:", "//")):
                continue
            parsed = urlparse(ref)
            if parsed.scheme or parsed.netloc:
                continue
            target = parsed.path
            if not target:
                continue
            if target.startswith("/"):
                candidate = paths / target.lstrip("/")
            else:
                candidate = path.parent / target
            candidates = [candidate, candidate / "index.html"]
            if candidate.suffix:
                candidates = [candidate]
            if not any(c.exists() for c in candidates):
                problems.append(f"{rel}: broken internal reference {ref!r}")
    return problems
