"""Jinja environment, Markdown rendering, and display helpers."""

from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import re
from pathlib import Path
from typing import Any

import jinja2
from markdown_it import MarkdownIt
from mdit_py_plugins.deflist import deflist_plugin
from mdit_py_plugins.footnote import footnote_plugin
from mdit_py_plugins.tasklists import tasklists_plugin
from pygments import highlight as pygments_highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name, guess_lexer
from pygments.util import ClassNotFound

from .content import reading_minutes, word_count

TIMELINE_KIND_LABELS = {
    "release": "Release",
    "fix": "Fix",
    "incident": "Incident",
    "actor": "Actor",
    "default": "Event",
}
TIMELINE_KIND_ORDER = ("release", "fix", "incident", "actor", "default")


def _inline_markup(text: str) -> str:
    """Escape text, then allow `inline code` in component fields."""
    escaped = html.escape(text)
    return re.sub(r"`([^`]+)`", lambda match: f"<code>{match.group(1)}</code>", escaped)


def _timeline_block(code: str) -> str:
    title = ""
    events: list[tuple[str, str, str, str]] = []
    for number, raw in enumerate(code.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("title:"):
            title = line.split(":", 1)[1].strip()
            continue
        parts = [part.strip() for part in line.split("|")]
        if len(parts) < 2 or not parts[0] or not parts[1]:
            raise ValueError(f"timeline line {number}: expected `date | event | description | kind`")
        date, event = parts[0], parts[1]
        if len(parts) >= 4 and parts[-1].lower() in TIMELINE_KIND_LABELS:
            kind = parts[-1].lower()
            description = " | ".join(parts[2:-1])
        else:
            kind = "default"
            description = " | ".join(parts[2:]) if len(parts) >= 3 else ""
        events.append((date, event, description, kind))

    if not events:
        raise ValueError("timeline block has no events")

    timeline_id = "timeline-" + hashlib.sha1(code.encode("utf-8")).hexdigest()[:8]
    present = [kind for kind in TIMELINE_KIND_ORDER if any(event[3] == kind for event in events)]
    counts = {kind: sum(1 for event in events if event[3] == kind) for kind in present}

    filters = ['<button class="tag" type="button" data-timeline-filter="all" aria-pressed="true">All</button>']
    for kind in present:
        filters.append(
            f'<button class="tag" type="button" data-timeline-filter="{kind}" aria-pressed="false">'
            f'{TIMELINE_KIND_LABELS[kind]} <span class="tag__count">{counts[kind]}</span></button>'
        )

    items = []
    for date, event, description, kind in events:
        body = [f'<p class="timeline__desc">{_inline_markup(description)}</p>'] if description else []
        items.append(
            '<li class="timeline__item" data-timeline-item data-kind="' + kind + '">'
            '<span class="timeline__marker" aria-hidden="true"></span>'
            '<div class="timeline__body">'
            f'<div class="timeline__meta"><time>{_inline_markup(date)}</time>'
            f'<span class="timeline__kind timeline__kind--{kind}">{TIMELINE_KIND_LABELS[kind]}</span></div>'
            f'<h4 class="timeline__event">{_inline_markup(event)}</h4>'
            + "".join(body)
            + "</div></li>"
        )

    title_html = f'<h3 class="timeline__title" id="{timeline_id}-title">{_inline_markup(title)}</h3>' if title else ""
    labelled = f' aria-labelledby="{timeline_id}-title"' if title else ' aria-label="Timeline"'
    return (
        f'<section class="timeline" id="{timeline_id}" data-timeline{labelled}>'
        f'<div class="timeline__head">{title_html}'
        f'<div class="timeline__filters" role="group" aria-label="Filter timeline">{"".join(filters)}</div>'
        "</div>"
        f'<ol class="timeline__list">{"".join(items)}</ol>'
        '<p class="timeline__empty" data-timeline-empty hidden>No events match this filter.</p>'
        "</section>"
    )


MONTHS = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)


def format_date(value: dt.date | dt.datetime | str) -> str:
    if isinstance(value, str):
        value = dt.date.fromisoformat(value)
    if isinstance(value, dt.datetime):
        value = value.date()
    return f"{MONTHS[value.month - 1]} {value.day}, {value.year}"


def rfc822(value: dt.date | dt.datetime | str) -> str:
    if isinstance(value, str):
        value = dt.date.fromisoformat(value)
    if isinstance(value, dt.datetime):
        value = value.date()
    return value.strftime("%a, %d %b %Y 00:00:00 GMT")


def iso_date(value: dt.date | dt.datetime | str) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dt.datetime):
        return value.date().isoformat()
    return value.isoformat()


def absolute_url(base: str, path: str) -> str:
    if path.startswith(("http://", "https://", "mailto:")):
        return path
    return f"{base.rstrip('/')}/{path.lstrip('/')}"


def jsonld(value: Any) -> str:
    return html.escape(json.dumps(value, ensure_ascii=False), quote=False)


def _code_block(code: str, language: str) -> str:
    language = language or "text"
    if language == "timeline":
        return _timeline_block(code)
    if language == "mermaid":
        return (
            '<div class="mermaid-block">'
            '<div class="mermaid-block__bar"><span>Diagram</span></div>'
            f'<pre class="mermaid">{html.escape(code)}</pre>'
            "</div>"
        )
    try:
        lexer = get_lexer_by_name(language, stripall=False)
    except ClassNotFound:
        try:
            lexer = guess_lexer(code)
        except ClassNotFound:
            lexer = get_lexer_by_name("text")
    formatter = HtmlFormatter(nowrap=True)
    highlighted = pygments_highlight(code.rstrip("\n"), lexer, formatter)
    lines = highlighted.split("\n")
    numbered = "".join(f'<span class="code-line">{line}</span>' for line in lines)
    label = html.escape(language)
    return (
        '<div class="code-block">'
        f'<div class="code-block__bar"><span class="code-block__lang">{label}</span>'
        '<button class="code-block__copy" type="button" data-copy-code>Copy</button></div>'
        f'<pre class="code-block__pre" tabindex="0"><code>{numbered}</code></pre>'
        "</div>"
    )


def make_markdown() -> MarkdownIt:
    md = MarkdownIt(
        "commonmark",
        {
            "html": False,
            "linkify": True,
            "typographer": True,
            "breaks": False,
        },
    )
    md.enable(["table", "strikethrough", "linkify"])
    md.use(footnote_plugin).use(deflist_plugin).use(tasklists_plugin, enabled=True)
    md.renderer.rules["fence"] = lambda tokens, idx, options, env: _code_block(
        tokens[idx].content, tokens[idx].info.strip().split()[0] if tokens[idx].info else ""
    )
    return md


def make_env(templates: Path, site: dict[str, Any], asset_map: dict[str, str]) -> jinja2.Environment:
    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(templates),
        autoescape=jinja2.select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
        undefined=jinja2.StrictUndefined,
    )
    env.filters["date"] = format_date
    env.filters["iso_date"] = iso_date
    env.filters["rfc822"] = rfc822
    env.filters["absolute"] = lambda path: absolute_url(site["url"], path)
    env.filters["readtime"] = reading_minutes
    env.filters["wordcount"] = word_count
    env.filters["jsonld"] = jsonld
    env.globals["site"] = site
    env.globals["asset"] = lambda path: asset_url(path, asset_map)
    env.globals["current_year"] = dt.date.today().year
    return env


def asset_url(path: str, asset_map: dict[str, str]) -> str:
    clean = path.lstrip("/")
    if clean.startswith(("http://", "https://")):
        return clean
    digest = asset_map.get(clean)
    url = "/assets/" + clean
    return f"{url}?v={digest}" if digest else url


def file_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]
