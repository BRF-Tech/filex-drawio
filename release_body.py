#!/usr/bin/env python3
"""The body of a GitHub release: the CHANGELOG.md section of that version.

    python3 release_body.py 31.5.3 > dist/release-notes.md

Why (filex task #122, 2026-09-28): the Release workflow published every
release with GitHub's generated notes alone - one "Full Changelog" line - and
that body is exactly what filex shows an administrator under "Release notes"
when it offers the update (Admin -> Plugins -> Apps -> Review update). The
words are already written, in CHANGELOG.md; this hands them over.

A version with no section is an error, not an empty body: a release without a
changelog entry is a mistake to fix before the tag. The section is everything
under `## <version>` (the rest of the heading line belongs to the heading) up
to the next `## ` heading.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def changelog_section(changelog: str, version: str) -> str | None:
    """The body of `## <version>` in changelog, stripped; None when there is none."""
    lines = changelog.replace("\r\n", "\n").split("\n")
    head = re.compile(r"^## \[?v?" + re.escape(version) + r"\]?(\s|$)")
    start = next((i for i, line in enumerate(lines) if head.match(line)), None)
    if start is None:
        return None
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    body = "\n".join(lines[start + 1:end]).strip()
    return body or None


def main(argv: list[str]) -> int:
    version = (argv[1] if len(argv) > 1 else "").removeprefix("v")
    if not version:
        print("usage: python3 release_body.py <version>", file=sys.stderr)
        return 2
    body = changelog_section((ROOT / "CHANGELOG.md").read_text(encoding="utf-8"), version)
    if body is None:
        print(f'CHANGELOG.md has no "## {version}" section with text in it: write what {version} changes before tagging it',
              file=sys.stderr)
        return 1
    # Bytes, not text: the notes are UTF-8 whatever the console's encoding is.
    sys.stdout.buffer.write((body + "\n").encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
