# Almanac (formerly Tabby)

Chrome extension (Manifest V3): a new tab page with seasonal photos and link sets, plus a settings page that previews the real new tab. Plain HTML/CSS/JS, no build step; `release` is the default branch and every push to it publishes to the Chrome Web Store (see `.github/workflows/publish.yml`).

## Store screenshots

After any change that affects how the new tab or settings page looks (`new-tab.*`, `options.*`, `panels.css`, `render.js`, images), run `scripts/screenshots.sh` to regenerate `store/*.png` (screenshots, captions and promo tiles), commit them with the change, and remind the user to upload them in the Chrome Web Store developer dashboard. The store API can't update listing images, so that step is always manual.

## Stored data

Users' links live in `chrome.storage.sync` (`tabbyMeta`, `tabbySet:<name>`) and must never be lost. See `storage.js`.

- New setting: add a default to `defaultSettings`. Nothing else.
- Renaming or restructuring a stored field: bump `SCHEMA_VERSION` and add a step to `MIGRATIONS`. Migrations run in memory on load; the result is saved on the user's next edit.
- Never rename or delete storage keys. Older versions on other devices still read them.
- Never write or delete user data during load.
- Test changes against data saved by the released version, not only fresh installs.

## Releasing

Merging to `release` uploads a new version (`.github/workflows/publish.yml`), then submits it for review or leaves it as a dashboard draft. Draft is needed when a release changes anything the store API can't update: listing text, screenshots or promo images (`store/`), or permissions (which change the Privacy practices tab).

- Before merging to `release`, check for those changes and label the PR `release: draft` or `release: submit`. With no label the workflow decides the same way itself (draft if `store/` or manifest permissions changed since the last `v*` tag).
- After a draft upload, tell the user exactly what to change in the dashboard, pointing at `store/LISTING.md` and the files in `store/`. Once they confirm it's done, run `gh workflow run submit.yml`.
- To upload again by hand: `gh workflow run publish.yml -f mode=draft` (or `submit`, `auto`).
- The run's summary says which mode it chose and why: `gh run view <id>`.
