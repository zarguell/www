#!/usr/bin/env python3
"""Build arguelles.me from Markdown + JSON with Jinja2 templates."""

from __future__ import annotations

import argparse
import functools
import http.server
import shutil
import sys
from pathlib import Path

from engine.assets import build_assets
from engine.config import Paths
from engine.pages import SiteBuilder
from engine.validate import validate

ROOT = Path(__file__).resolve().parent


def clean_dist(paths: Paths) -> None:
    if paths.dist.exists():
        shutil.rmtree(paths.dist)
    paths.dist.mkdir(parents=True)


def build(production: bool = True) -> None:
    paths = Paths.from_root(ROOT)
    clean_dist(paths)
    asset_map = build_assets(paths)
    builder = SiteBuilder(paths, asset_map)
    builder.build_all()
    problems = validate(paths.dist, builder.site["url"])
    if problems:
        print("Build validation failed:", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        raise SystemExit(1)
    pages = len(list(paths.dist.rglob("*.html")))
    print(f"Built {pages} HTML pages into {paths.dist.relative_to(ROOT)}/")


def serve(directory: Path, port: int = 4321) -> None:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Serving {directory} at http://127.0.0.1:{port}/")
    server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serve", action="store_true", help="build, then serve dist/ on :4321")
    parser.add_argument("--port", type=int, default=4321)
    parser.add_argument("--vendor-only", action="store_true", help="only refresh dist/assets")
    parser.add_argument("--no-minify", action="store_true", help="keep transpiled JS readable")
    args = parser.parse_args()

    paths = Paths.from_root(ROOT)
    if args.vendor_only:
        paths.dist.mkdir(parents=True, exist_ok=True)
        build_assets(paths)
        print("Vendored assets refreshed.")
        return

    build(production=not args.no_minify)
    if args.serve:
        serve(paths.dist, args.port)


if __name__ == "__main__":
    main()
