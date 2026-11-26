#!/usr/bin/env python3
"""Build the baked taxonomy and body-mass table for the eBird Analytics tool.

Sources, both fetched at build time and never committed:

- eBird taxonomy: `api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&cat=species`
  (keyless). Gives scientific name, common name, family, order, taxon order.
- Body masses: Everybird's `public/data/species.v1.json`
  (github.com/yusuftaleb/everybird, MIT). Everybird in turn sources masses from
  AVONET (CC BY 4.0, doi:10.1111/ele.13898) and BIRDBASE (CC BY 4.0,
  doi:10.1038/s41597-025-05615-3), with a few sourced overrides.
- Region names: Everybird's `public/data/regions.v1.json` (MIT), built from
  Natural Earth (public domain) and Debian iso-codes (LGPL-2.1, names only).

Everybird is MIT-licensed code; the mass values are CC BY 4.0 from AVONET and
BIRDBASE. Both are credited on the tool page and in
`src/static/data/README.md`.

Output `src/static/data/ebird-taxonomy.json` is indexed and sorted so it stays
compact (341 KB raw, ~79 KB gzipped) and diffs cleanly between regenerations.

Usage:
    python scripts/build-taxonomy.py            # fetch and rewrite
    python scripts/build-taxonomy.py --check    # exit 1 if the file is stale
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import urllib.request

EBIRD_TAXONOMY = "https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&cat=species"
EVERYBIRD_SPECIES = (
    "https://raw.githubusercontent.com/yusuftaleb/everybird/main/public/data/species.v1.json"
)
EVERYBIRD_REGIONS = (
    "https://raw.githubusercontent.com/yusuftaleb/everybird/main/public/data/regions.v1.json"
)
OUTPUT = pathlib.Path(__file__).resolve().parent.parent / "static" / "data" / "ebird-taxonomy.json"

USER_AGENT = "arguelles.me taxonomy builder (+https://www.arguelles.me)"


def fetch_json(url: str) -> object:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)


def species_key(sci_name: str) -> str:
    """Two-word binomial: subspecies groups fold into their parent species."""
    return " ".join(sci_name.split()[:2])


def build() -> dict[str, object]:
    taxonomy = fetch_json(EBIRD_TAXONOMY)
    if not isinstance(taxonomy, list):
        raise SystemExit("eBird taxonomy response was not a list")

    # Species code and binomial -> mass in grams, keyed the way the page looks up.
    everybird = fetch_json(EVERYBIRD_SPECIES)
    species_rows = everybird.get("species", []) if isinstance(everybird, dict) else []
    mass_by_code: dict[str, int] = {}
    for row in species_rows:
        code = row.get("code")
        grams = row.get("g")
        # Masses are floats in this file (46073.9); JSON ints and floats both
        # arrive as numbers here, and bool is an int subclass to keep out.
        if (
            isinstance(code, str)
            and isinstance(grams, (int, float))
            and not isinstance(grams, bool)
            and grams > 0
        ):
            mass_by_code[code] = round(grams)

    # Families carry both names: the common name is for display, the scientific
    # name builds the sticker path (stickers/<Order>/<Family>/<Genus_species>).
    family_names: dict[str, str] = {}
    for entry in taxonomy:
        common = entry.get("familyComName")
        scientific = entry.get("familySciName")
        if common and scientific:
            family_names.setdefault(common, scientific)

    families = [
        [common, family_names[common]] for common in sorted(family_names)
    ]
    orders = sorted({entry["order"] for entry in taxonomy if entry.get("order")})
    family_index = {pair[0]: index for index, pair in enumerate(families)}
    order_index = {name: index for index, name in enumerate(orders)}

    entries: dict[str, list[object]] = {}
    for entry in taxonomy:
        family = entry.get("familyComName")
        order = entry.get("order")
        code = entry.get("speciesCode")
        key = species_key(entry["sciName"])
        entries[key] = [
            family_index.get(family, -1),
            order_index.get(order, -1),
            mass_by_code.get(code, 0),
        ]

    # Display names for the state/province codes eBird writes into the export
    # ("US-MD") and for country codes ("US", "CR").
    regions = fetch_json(EVERYBIRD_REGIONS)
    sub1 = regions.get("sub1", {}) if isinstance(regions, dict) else {}
    countries = regions.get("countries", {}) if isinstance(regions, dict) else {}

    return {"f": families, "o": orders, "m": entries, "s": sub1, "c": countries}


def serialise(data: dict[str, object]) -> str:
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False, sort_keys=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if the committed file differs from what the sources produce",
    )
    args = parser.parse_args()

    payload = serialise(build())
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    if args.check:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        if current != payload:
            print(f"{OUTPUT} is stale; run scripts/build-taxonomy.py", file=sys.stderr)
            raise SystemExit(1)
        print(f"{OUTPUT} is up to date")
        return

    OUTPUT.write_text(payload, encoding="utf-8")
    species = len(json.loads(payload)["m"])
    print(f"wrote {OUTPUT} ({len(payload) / 1024:.0f} KB, {species} species)")


if __name__ == "__main__":
    main()
