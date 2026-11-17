"""Validate the JSON content registries."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_links_have_valid_urls_and_titles() -> None:
    data = json.loads((ROOT / "content" / "links.json").read_text())
    assert data["categories"]
    for category in data["categories"]:
        assert category["name"]
        assert category["links"]
        for link in category["links"]:
            assert link["title"].strip()
            assert link["description"].strip()
            assert link["url"].startswith("https://")
    for item in data["coolFinds"]:
        assert item["title"].strip()
        assert item["url"].startswith("https://")
        assert item["tags"]
        assert len(item["date"]) == 10


def test_tools_have_required_metadata() -> None:
    categories = json.loads((ROOT / "content" / "tools.json").read_text())
    ids = [category["id"] for category in categories]
    assert len(ids) == len(set(ids))
    for category in categories:
        assert category["tools"]
        for tool in category["tools"]:
            assert tool["title"]
            assert len(tool["description"]) > 20
            assert tool["badge"]
            assert tool["features"]
            assert len(tool["lastModified"]) == 10
