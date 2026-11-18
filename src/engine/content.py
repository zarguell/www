"""Content loading: Markdown with YAML front matter, JSON registries."""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .config import Paths, load_json

FRONT_MATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.S)
WORD = re.compile(r"[\w'’-]+", re.UNICODE)


@dataclass
class Page:
    slug: str
    meta: dict[str, Any]
    body: str
    source: Path


@dataclass
class Post:
    slug: str
    title: str
    description: str
    pub_date: dt.date
    pub_time: str | None
    updated_date: dt.date | None
    tags: list[str]
    image: str | None
    body: str
    source: Path
    html: str = ""
    reading_time: int = 1
    word_count: int = 0
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def iso_date(self) -> str:
        return self.pub_date.isoformat()


def split_front_matter(text: str, source: Path) -> tuple[dict[str, Any], str]:
    match = FRONT_MATTER.match(text)
    if not match:
        raise ValueError(f"{source}: missing YAML front matter")
    meta = yaml.safe_load(match.group(1)) or {}
    if not isinstance(meta, dict):
        raise ValueError(f"{source}: front matter must be a mapping")
    return meta, text[match.end() :]


def _as_date(value: Any, source: Path, key: str) -> dt.date:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    if isinstance(value, str):
        return dt.date.fromisoformat(value)
    raise ValueError(f"{source}: {key} must be a date")


def load_page(paths: Paths, slug: str) -> Page:
    source = paths.content / "pages" / f"{slug}.md"
    meta, body = split_front_matter(source.read_text(encoding="utf-8"), source)
    return Page(slug=slug, meta=meta, body=body.strip(), source=source)


def load_posts(paths: Paths) -> list[Post]:
    posts: list[Post] = []
    for source in sorted((paths.content / "blog").glob("*.md")):
        meta, body = split_front_matter(source.read_text(encoding="utf-8"), source)
        if meta.get("draft", False):
            continue
        slug = meta.get("slug") or source.stem
        posts.append(
            Post(
                slug=str(slug),
                title=str(meta["title"]),
                description=str(meta["description"]),
                pub_date=_as_date(meta["pubDate"], source, "pubDate"),
                pub_time=str(meta["pubTime"]) if meta.get("pubTime") else None,
                updated_date=(
                    _as_date(meta["updatedDate"], source, "updatedDate")
                    if meta.get("updatedDate")
                    else None
                ),
                tags=[str(tag) for tag in meta.get("tags", [])],
                image=meta.get("image"),
                body=body.strip(),
                source=source,
            )
        )
    posts.sort(key=lambda post: (post.pub_date, post.pub_time or "00:00"), reverse=True)
    return posts


def word_count(text: str) -> int:
    return len(WORD.findall(text))


def reading_minutes(text: str) -> int:
    return max(1, round(word_count(text) / 220))


def load_tools(paths: Paths) -> list[dict[str, Any]]:
    return load_json(paths.content / "tools.json")


def flatten_tools(categories: list[dict[str, Any]]) -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = []
    for category in categories:
        for tool in category["tools"]:
            tools.append({**tool, "category": category["name"], "category_id": category["id"]})
    return tools


def load_links(paths: Paths) -> dict[str, Any]:
    return load_json(paths.content / "links.json")


def load_colophon(paths: Paths) -> list[dict[str, str]]:
    return load_json(paths.content / "pages" / "colophon.json")


def latest_post(posts: list[Post]) -> Post | None:
    return posts[0] if posts else None


def newest_tool(tools: list[dict[str, Any]]) -> dict[str, Any] | None:
    local = [tool for tool in tools if tool.get("slug")]
    if not local:
        return None
    return max(local, key=lambda tool: tool["lastModified"])
