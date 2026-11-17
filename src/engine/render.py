"""Jinja environment, Markdown rendering, and display helpers."""

from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
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
