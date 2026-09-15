#!/usr/bin/env python3
"""Copy the current source tree without private Git history or ignored local files.

This is a packaging aid, not a replacement for reviewing and scanning the result.
Run from any directory: python3 scripts/export-public-source.py /path/to/new-directory
"""

import argparse
import os
from pathlib import Path
import shutil
import subprocess


def git(root, *args, input_data=None, allowed_codes=(0,)):
    result = subprocess.run(
        ["git", "-C", str(root), *args], input=input_data,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    if result.returncode not in allowed_codes:
        raise RuntimeError(f"Git command failed: {args[0]}")
    return result.stdout


def export_source(root, destination):
    root = root.resolve(strict=True)
    destination = destination.resolve()
    if destination == root or root in destination.parents:
        raise ValueError("Destination must be outside the source repository")
    if destination.exists():
        raise ValueError("Destination already exists; choose a new directory")

    # Include new source files and current edits; staged/deleted files stay deleted.
    paths = sorted(set(git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z").split(b"\0")) - {b""})
    ignored = set(git(
        root, "check-ignore", "--no-index", "--stdin", "-z",
        input_data=b"\0".join(paths) + b"\0", allowed_codes=(0, 1),
    ).split(b"\0"))

    sources = []
    for raw_path in paths:
        if raw_path in ignored:
            continue
        relative = Path(os.fsdecode(raw_path))
        if relative.is_absolute() or ".." in relative.parts or ".git" in relative.parts:
            raise ValueError(f"Unsafe source path: {relative}")
        source = root / relative
        if source.is_symlink() or source.resolve() != source:
            raise ValueError(f"Review symlink before exporting: {relative}")
        if not source.exists():
            continue
        if not source.is_file():
            raise ValueError(f"Review submodule or non-file before exporting: {relative}")
        sources.append((source, relative))

    if not sources:
        raise ValueError("No source files found")
    destination.mkdir(parents=True, exist_ok=False)
    for source, relative in sources:
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        # Preserve executable scripts without copying local ownership or timestamps.
        target.chmod(0o755 if source.stat().st_mode & 0o111 else 0o644)
    return len(sources)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[1]
    try:
        count = export_source(repo_root, args.destination)
    except (ValueError, RuntimeError, OSError) as error:
        parser.exit(1, f"Export stopped: {error}\n")
    print(f"Exported {count} files to {args.destination.resolve()}")
    print("No Git history copied. Review and scan this directory before publishing.")
