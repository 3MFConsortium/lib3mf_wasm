#!/usr/bin/env python3
"""Prepare this repository for a new lib3mf WASM npm release.

This script updates:
- build/lib3mf.cjs
- build/lib3mf.wasm
- package.json version
- package-lock.json version
- README.md current version references

By default it downloads the WASM artifact zip for the given version from:
https://github.com/3MFConsortium/lib3mf/releases

You can override the source with --source for local/offline workflows.
"""

from __future__ import annotations

import argparse
import io
import json
import pathlib
import re
import subprocess
import sys
import urllib.request
import zipfile


REPO_ROOT = pathlib.Path(__file__).resolve().parent
BUILD_DIR = REPO_ROOT / "build"
README_PATH = REPO_ROOT / "README.md"
PACKAGE_JSON = REPO_ROOT / "package.json"
PACKAGE_LOCK_JSON = REPO_ROOT / "package-lock.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "version",
        help="Release version (for example: 2.5.0).",
    )
    parser.add_argument(
        "--source",
        help=(
            "Optional override source: directory containing wasm/js files, local .zip, "
            "or URL to .zip. If omitted, source is built from --artifact-url-template and version."
        ),
    )
    parser.add_argument(
        "--artifact-url-template",
        default=(
            "https://github.com/3MFConsortium/lib3mf/releases/download/"
            "v{version}/lib3mf-wasm-{version}.zip"
        ),
        help=(
            "Artifact URL template containing {version}. "
            "Default: GitHub release wasm zip."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show planned operations without writing files.",
    )
    parser.add_argument(
        "--skip-readme-update",
        action="store_true",
        help="Do not update README.md version references.",
    )
    parser.add_argument(
        "--skip-package-version-update",
        action="store_true",
        help="Do not update package.json / package-lock.json version.",
    )
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Create a git commit after updating files.",
    )
    parser.add_argument(
        "--push",
        action="store_true",
        help="Push after commit (requires --commit).",
    )
    return parser.parse_args()


def is_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def version_is_valid(version: str) -> bool:
    return bool(re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version))


def find_best_candidate(names: list[str], allowed_exts: tuple[str, ...]) -> str:
    files = [n for n in names if not n.endswith("/")]
    candidates = [n for n in files if pathlib.Path(n).suffix.lower() in allowed_exts]
    if not candidates:
        raise FileNotFoundError(f"Could not find any file with extensions: {allowed_exts}")

    preferred_basenames = {
        "lib3mf.cjs",
        "lib3mf.js",
        "lib3mf.mjs",
        "lib3mf.wasm",
    }

    def score(name: str) -> tuple[int, int, int]:
        base = pathlib.Path(name).name.lower()
        contains_lib3mf = "lib3mf" in base
        preferred = base in preferred_basenames
        # Sort by:
        # 1) file mentions lib3mf
        # 2) known preferred basenames
        # 3) shortest path as tie-breaker
        return (1 if contains_lib3mf else 0, 1 if preferred else 0, -len(name))

    best = max(candidates, key=score)
    return best


def load_zip_bytes(source: str) -> bytes:
    if is_url(source):
        print(f"Downloading WASM artifact zip from {source}")
        with urllib.request.urlopen(source, timeout=30) as response:
            return response.read()
    return pathlib.Path(source).read_bytes()


def extract_from_zip(zip_bytes: bytes) -> tuple[bytes, str, bytes, str]:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        wasm_member = find_best_candidate(names, (".wasm",))
        js_member = find_best_candidate(names, (".js", ".cjs", ".mjs"))
        wasm_data = zf.read(wasm_member)
        js_data = zf.read(js_member)
        return js_data, js_member, wasm_data, wasm_member


def read_from_directory(source_dir: pathlib.Path) -> tuple[bytes, str, bytes, str]:
    files = [str(p.relative_to(source_dir)) for p in source_dir.rglob("*") if p.is_file()]
    if not files:
        raise FileNotFoundError(f"No files found under directory: {source_dir}")

    wasm_rel = find_best_candidate(files, (".wasm",))
    js_rel = find_best_candidate(files, (".js", ".cjs", ".mjs"))

    js_data = (source_dir / js_rel).read_bytes()
    wasm_data = (source_dir / wasm_rel).read_bytes()
    return js_data, js_rel, wasm_data, wasm_rel


def write_artifacts(
    js_data: bytes,
    js_origin: str,
    wasm_data: bytes,
    wasm_origin: str,
    dry_run: bool,
) -> None:
    js_dst = BUILD_DIR / "lib3mf.cjs"
    wasm_dst = BUILD_DIR / "lib3mf.wasm"

    if dry_run:
        print(f"[dry-run] Would write JS runtime {js_origin} -> {js_dst}")
        print(f"[dry-run] Would write WASM binary {wasm_origin} -> {wasm_dst}")
        return

    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    js_dst.write_bytes(js_data)
    wasm_dst.write_bytes(wasm_data)
    print(f"Wrote JS runtime {js_origin} -> {js_dst}")
    print(f"Wrote WASM binary {wasm_origin} -> {wasm_dst}")


def update_json_version(path: pathlib.Path, version: str, dry_run: bool) -> None:
    obj = json.loads(path.read_text(encoding="utf-8"))
    original_version = obj.get("version")
    obj["version"] = version

    if "packages" in obj and isinstance(obj["packages"], dict):
        root_pkg = obj["packages"].get("")
        if isinstance(root_pkg, dict):
            root_pkg["version"] = version

    if original_version == version:
        print(f"{path.name} version already {version}")
        return

    if dry_run:
        print(f"[dry-run] Would update {path.name} version {original_version} -> {version}")
        return

    path.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {path.name} version {original_version} -> {version}")


def update_readme_version(version: str, dry_run: bool) -> None:
    original = README_PATH.read_text(encoding="utf-8")
    updated = original
    updated = re.sub(
        r"(Packaged lib3mf core version:\s*)v[0-9]+\.[0-9]+\.[0-9]+",
        rf"\1v{version}",
        updated,
    )
    updated = re.sub(
        r"(npm package version:\s*)v[0-9]+\.[0-9]+\.[0-9]+",
        rf"\1v{version}",
        updated,
    )
    updated = re.sub(
        r"(WASM source artifact:\s*`https://github\.com/3MFConsortium/lib3mf/releases/download/v)"
        r"[0-9]+\.[0-9]+\.[0-9]+(/lib3mf-wasm-)"
        r"[0-9]+\.[0-9]+\.[0-9]+(\.zip`)",
        rf"\g<1>{version}\g<2>{version}\g<3>",
        updated,
    )

    if updated == original:
        print("README.md version strings already up to date.")
        return

    if dry_run:
        print(f"[dry-run] Would update README.md to v{version}")
        return

    README_PATH.write_text(updated, encoding="utf-8")
    print(f"Updated README.md to v{version}")


def maybe_commit_and_push(version: str, do_commit: bool, do_push: bool, dry_run: bool) -> None:
    if not do_commit and not do_push:
        return
    if do_push and not do_commit:
        raise ValueError("--push requires --commit")

    if dry_run:
        print("[dry-run] Would run git add/commit/push")
        return

    commit_message = f"Release version {version}"
    subprocess.run(["git", "add", "."], cwd=REPO_ROOT, check=True)
    subprocess.run(["git", "commit", "-m", commit_message], cwd=REPO_ROOT, check=True)
    print(f"Created commit: {commit_message}")
    if do_push:
        subprocess.run(["git", "push"], cwd=REPO_ROOT, check=True)
        print("Pushed commit.")


def main() -> int:
    args = parse_args()

    if not version_is_valid(args.version):
        raise ValueError("Version must be in MAJOR.MINOR.PATCH format (example: 2.5.0).")

    source = args.source or args.artifact_url_template.format(version=args.version)
    source_path = pathlib.Path(source)

    if source_path.exists() and source_path.is_dir():
        print(f"Using source directory: {source_path}")
        js_data, js_origin, wasm_data, wasm_origin = read_from_directory(source_path)
    elif source_path.exists() and source_path.is_file():
        print(f"Using local artifact zip: {source_path}")
        js_data, js_origin, wasm_data, wasm_origin = extract_from_zip(
            source_path.read_bytes()
        )
    elif is_url(source):
        zip_bytes = load_zip_bytes(source)
        js_data, js_origin, wasm_data, wasm_origin = extract_from_zip(zip_bytes)
    else:
        raise FileNotFoundError(f"Source path does not exist: {source}")

    write_artifacts(js_data, js_origin, wasm_data, wasm_origin, args.dry_run)

    if not args.skip_package_version_update:
        update_json_version(PACKAGE_JSON, args.version, args.dry_run)
        if PACKAGE_LOCK_JSON.exists():
            update_json_version(PACKAGE_LOCK_JSON, args.version, args.dry_run)

    if not args.skip_readme_update:
        update_readme_version(args.version, args.dry_run)

    maybe_commit_and_push(args.version, args.commit, args.push, args.dry_run)
    print("Release preparation complete.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
