"""Filesystem layout and site-wide configuration."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Paths:
    root: Path
    content: Path
    templates: Path
    assets: Path
    static: Path
    dist: Path
    node_modules: Path

    @classmethod
    def from_root(cls, root: Path) -> "Paths":
        return cls(
            root=root,
            content=root / "content",
            templates=root / "templates",
            assets=root / "assets",
            static=root / "static",
            dist=root / "dist",
            node_modules=root / "node_modules",
        )


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_site(paths: Paths) -> dict[str, Any]:
    return load_json(paths.content / "site.json")
