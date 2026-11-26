"""The GitHub release's body is the version's CHANGELOG.md section
(release_body.py), and the Release workflow publishes it.

Why (filex task #122): releases went out with GitHub's generated notes alone -
one "Full Changelog" line - and that body is what filex shows an administrator
under "Release notes" on "Review update".

RED PROOF: before this, release_body.py did not exist and the workflow passed
no body (`generate_release_notes` alone).

    python3 -m unittest discover -s tests -v
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from release_body import changelog_section  # noqa: E402


def run(version: str, root: Path = ROOT) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run([sys.executable, str(root / "release_body.py"), version], capture_output=True, check=False)


def sandbox(changelog: str) -> Path:
    d = Path(tempfile.mkdtemp(prefix="release-body-"))
    shutil.copy(ROOT / "release_body.py", d / "release_body.py")
    (d / "CHANGELOG.md").write_bytes(changelog.encode("utf-8"))
    return d


class ReleaseBody(unittest.TestCase):
    def test_this_version_is_its_changelog_section(self) -> None:
        version = json.loads((ROOT / "filex-app.json").read_text(encoding="utf-8"))["version"]
        changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
        if changelog_section(changelog, version) is None:
            # Not released yet. The app's version is draw.io's (build.py), so a draw.io bump moves
            # filex-app.json in the same commit, and its note waits under "## Unreleased" until the
            # release commit turns that section into "## <version> - <date>" (filex-apps-bot,
            # filex Roadmap #375). The tag still needs its own section: release_body.py refuses it.
            pending = changelog_section(changelog, "Unreleased")
            self.assertIsNotNone(pending, f'CHANGELOG.md has neither a "## {version}" section nor an Unreleased note')
            self.assertIn(version, pending, "the Unreleased note does not name the version it waits for")
            self.assertIn("draw.io", pending)
            self.assertNotEqual(run(version).returncode, 0, "a version still under Unreleased is not released")
            return
        out = run(version)
        self.assertEqual(out.returncode, 0, out.stderr.decode("utf-8", "replace"))
        body = out.stdout.decode("utf-8")
        self.assertIn("draw.io", body)
        self.assertNotRegex(body, r"(?m)^## ")
        self.assertEqual(run("v" + version).stdout, out.stdout, "a tag's leading v is not part of the version")

    def test_markdown_kept_and_the_next_version_left_out(self) -> None:
        text = "# Changelog\r\n\r\n## 1.1.0 - 2026-10-01\r\n\r\n- **Bold** and `code`\r\n\r\n### Fixed\r\n\r\n- a fix\r\n\r\n## 1.0.0\r\n\r\n- old\r\n"
        self.assertEqual(changelog_section(text, "1.1.0"), "- **Bold** and `code`\n\n### Fixed\n\n- a fix")
        self.assertEqual(changelog_section(text, "1.0.0"), "- old")

    def test_no_section_is_no_release(self) -> None:
        d = sandbox("# Changelog\n\n## 1.0.0\n\n- first\n\n## 1.0.1\n\n")
        try:
            for version in ("9.9.9", "1.0.1", "1.0"):
                out = run(version, d)
                self.assertNotEqual(out.returncode, 0, version)
                self.assertEqual(out.stdout, b"", version)
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def test_the_release_workflow_publishes_it(self) -> None:
        wf = (ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")
        self.assertIn('python3 release_body.py "${GITHUB_REF_NAME#v}" > dist/release-notes.md', wf)
        self.assertIn("body_path: dist/release-notes.md", wf)


if __name__ == "__main__":
    unittest.main()
