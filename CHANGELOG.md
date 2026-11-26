# Changelog

## Unreleased

- playwright-core 1.65.1 (was 1.65.0).
- draw.io 32.7.7 (was 32.6.10), draw.io's latest release.

## 32.6.10 - 2026-11-08

- draw.io 32.6.10 (was 31.5.3), draw.io's latest release. The adapter is
  unchanged and works with it as it did with 31: open, draw, **Save** and
  **New document → draw.io diagram** were checked in Chrome, Firefox and
  WebKit on filex 0.59.0 and 0.48.1. draw.io 32 ships fewer files (the
  stencils come only in `js/stencils.min.js`, MathJax in one file, and the
  Dropbox, GitHub and GitLab pages are gone): `ui.zip` is 43.2 MiB with
  3067 files (was 47.2 MiB with 3384).
- The filex interface SDK of filex 0.59.0 (`@brftech/filex-app-ui`, was
  0.48.0). It only adds methods the adapter does not call; the app still
  needs filex 0.48.0 or later.
- Installing from `main` works again: `main` had carried a re-sealed bundle
  under 31.5.3's address, so filex refused it with `sha256_mismatch`. The
  manifest on `main` is again the released one.
- A release's notes on GitHub are its `CHANGELOG.md` section, so filex's
  "Review update" says what the version changes (it showed only GitHub's
  "Full Changelog" line). A version with no section is not released.
- The workflows pin every action by commit SHA, with its version beside
  it: `actions/checkout` v7.0.1, `actions/setup-python` v7.1.0,
  `actions/cache` v6.1.0, `softprops/action-gh-release` v3.0.4. The
  browser measurement uses `playwright-core` 1.65.

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
