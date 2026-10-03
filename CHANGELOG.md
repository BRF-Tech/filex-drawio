# Changelog

## Unreleased

- A release's notes on GitHub are its `CHANGELOG.md` section, so filex's
  "Review update" says what the version changes (it showed only GitHub's
  "Full Changelog" line). A version with no section is not released.

## 31.5.3 - first release

- draw.io 31.5.3 as a filex app with its own interface and no module, for
  filex 0.48.0 or later.
- `.drawio` and `.dio` files open in draw.io in place of filex's preview;
  **Save** writes a new version.
- **New document → draw.io diagram**: a new diagram from a blank page, a
  draft until its first save.
- Permissions: `files:read`, `files:write`, `ui`, `ui:package-fetch`,
  `ui-viewer:.drawio`, `ui-viewer:.dio`, `ui-new:.drawio`.
- A reproducible `ui.zip`, pinned by sha256 in `filex-app.json`; a GitHub
  release on every `v*` tag.
