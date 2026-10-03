# vendor/

`filex-app-ui.iife.js` - the filex interface SDK, `@brftech/filex-app-ui`,
the IIFE build (`window.FilexAppUI`) from filex 0.48.0 (`packages/app-ui`,
`pnpm --filter @brftech/filex-app-ui build`). MIT, BRF Tech.

It is vendored, not downloaded at build time, so a build is reproducible:
the bundle's sha256 is pinned in `filex-app.json`, and a different SDK file
would be a different bundle. To move to a newer SDK, replace the file,
`python build.py --stamp`, and commit both.
