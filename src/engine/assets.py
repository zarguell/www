"""Build-time asset pipeline: compile CSS/TS and vendor pinned libraries."""

from __future__ import annotations

import hashlib
import re
import shutil
import subprocess
from pathlib import Path

from .config import Paths

CSS_BUNDLE_ORDER = (
    "base.css",
    "layout.css",
    "components.css",
    "pages.css",
    "prose.css",
    "tools.css",
)

# source in node_modules -> destination under dist/assets
VENDOR_FILES = {
    "plotly.js-dist-min/plotly.min.js": "vendor/plotly.min.js",
    "exifreader/dist/exif-reader.js": "vendor/exif-reader.js",
    "heic-to/dist/iife/heic-to.js": "vendor/heic-to.js",
    "jszip/dist/jszip.min.js": "vendor/jszip.min.js",
    "lz-string/libs/lz-string.min.js": "vendor/lz-string.min.js",
    "html-to-image/dist/html-to-image.js": "vendor/html-to-image.js",
    "tesseract.js/dist/tesseract.min.js": "vendor/tesseract/tesseract.min.js",
    "tesseract.js/dist/worker.min.js": "vendor/tesseract/worker.min.js",
    "@e965/xlsx/dist/xlsx.full.min.js": "vendor/xlsx.full.min.js",
    "mermaid/dist/mermaid.min.js": "vendor/mermaid.min.js",
}

TESSERACT_CORE = (
    "tesseract-core-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm.js",
    "tesseract-core-relaxedsimd-lstm.wasm.js",
)


def _copy(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def plotly_wheel_name(paths: Paths) -> str | None:
    requirements = paths.root / "requirements-vendor.txt"
    if not requirements.exists():
        return None
    match = re.search(r"^plotly==([\w.]+)$", requirements.read_text(), re.M)
    return f"plotly-{match.group(1)}-py3-none-any.whl" if match else None


def copy_static(paths: Paths) -> None:
    wheel = plotly_wheel_name(paths)
    wheel_pattern = re.compile(r"/assets/python/plotly-[^\"']+\.whl")
    for source in sorted(paths.static.rglob("*")):
        if not source.is_file():
            continue
        target = paths.dist / source.relative_to(paths.static)
        if wheel and source.suffix in {".py", ".json"}:
            text = source.read_text(encoding="utf-8")
            updated = wheel_pattern.sub(f"/assets/python/{wheel}", text)
            if updated != text:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(updated, encoding="utf-8")
                continue
        _copy(source, target)


def copy_images(paths: Paths) -> None:
    for source in sorted((paths.assets / "images").glob("*")):
        if source.is_file():
            _copy(source, paths.dist / "assets" / "images" / source.name)


def copy_fonts(paths: Paths) -> None:
    for source in sorted((paths.assets / "fonts").glob("*.woff2")):
        _copy(source, paths.dist / "assets" / "fonts" / source.name)


def bundle_css(paths: Paths) -> dict[str, bytes]:
    """Concatenate split CSS sources into one reviewable bundle."""
    parts: list[str] = []
    for name in CSS_BUNDLE_ORDER:
        source = paths.assets / "css" / name
        if not source.exists():
            raise FileNotFoundError(f"missing CSS source: {source}")
        parts.append(f"/* ---- {name} ---- */\n{source.read_text(encoding='utf-8').strip()}\n")
    bundle = "\n".join(parts)
    dest = paths.dist / "assets" / "css" / "main.css"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(bundle, encoding="utf-8")

    tool_css: dict[str, bytes] = {}
    overrides = paths.assets / "css" / "tool-overrides.css"
    overrides_data = overrides.read_bytes()
    overrides_target = paths.dist / "assets" / "css" / "tool-overrides.css"
    overrides_target.write_bytes(overrides_data)
    tool_css["assets/css/tool-overrides.css"] = overrides_data

    tool_dir = paths.assets / "css" / "tools"
    if tool_dir.exists():
        for source in sorted(tool_dir.glob("*.css")):
            data = source.read_bytes()
            target = paths.dist / "assets" / "css" / "tools" / source.name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            tool_css[f"assets/css/tools/{source.name}"] = data
    return {"assets/css/main.css": bundle.encode(), **tool_css}


def copy_plain_js(paths: Paths) -> None:
    for source in sorted((paths.assets / "js").glob("*.js")):
        _copy(source, paths.dist / "assets" / "js" / source.name)


def compile_ts(paths: Paths, *, production: bool = True) -> None:
    entries = sorted(
        entry
        for entry in (paths.assets / "js" / "tools").glob("*.ts")
        if not entry.stem.endswith("-app")
    )
    if not entries:
        return
    esbuild = paths.node_modules / ".bin" / "esbuild"
    if not esbuild.exists():
        raise FileNotFoundError("esbuild is missing; run `npm ci` first")
    command = [
        str(esbuild),
        *[str(entry) for entry in entries],
        "--bundle",
        "--format=esm",
        "--target=es2020",
        f"--outdir={paths.dist / 'assets' / 'js' / 'tools'}",
        "--sourcemap",
        "--log-level=warning",
    ]
    if production:
        command.append("--minify")
    subprocess.run(command, check=True, cwd=paths.root)


def vendor_libraries(paths: Paths) -> None:
    vendor = paths.dist / "assets" / "vendor"
    for source_rel, dest_rel in VENDOR_FILES.items():
        source = paths.node_modules / source_rel
        if not source.exists():
            raise FileNotFoundError(f"missing vendored dependency: {source}")
        _copy(source, paths.dist / "assets" / dest_rel)

    core_src = paths.node_modules / "tesseract.js-core"
    for name in TESSERACT_CORE:
        _copy(core_src / name, vendor / "tesseract" / name)

    lang_src = paths.assets / "vendor" / "tessdata" / "eng.traineddata.gz"
    _copy(lang_src, vendor / "tesseract" / "lang" / "eng.traineddata.gz")

    pyscript_src = paths.node_modules / "@pyscript" / "core" / "dist"
    pyscript_dest = vendor / "pyscript"
    for source in sorted(pyscript_src.iterdir()):
        if source.is_file() and source.suffix != ".map":
            _copy(source, pyscript_dest / source.name)


def build_assets(paths: Paths) -> dict[str, str]:
    """Copy/compile everything under dist/assets and return cache-busting digests."""
    copy_static(paths)
    copy_images(paths)
    copy_fonts(paths)
    bundle_css(paths)
    copy_plain_js(paths)
    compile_ts(paths)
    vendor_libraries(paths)

    digests: dict[str, str] = {}
    for path in sorted((paths.dist / "assets").rglob("*")):
        if path.is_file() and path.suffix in {".css", ".js", ".jpg", ".png", ".svg", ".woff2"}:
            rel = path.relative_to(paths.dist / "assets").as_posix()
            digests[rel] = hashlib.sha256(path.read_bytes()).hexdigest()[:10]
    return digests
