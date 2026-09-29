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

`.github/workflows/publish.yml` states the decision tree at its top. On a merge to `release`:

- Nothing in the package changed (workflows, docs, `store/` only): nothing runs. Dashboard-only changes are made and submitted by hand in the developer dashboard.
- The package changed, plus something the dashboard needs by hand (`store/`, `icons/`, manifest permissions): it uploads a draft.
- Only the package changed: it uploads and submits for review.

What to do:

- After a draft upload, or when merging a `store/`-only change, tell the user exactly what to update in the dashboard, pointing at `store/LISTING.md` and the files in `store/`. After a draft, once they confirm it's done, run `gh workflow run submit.yml`.
- To override the automatic choice, for example when the dashboard needs something the repo doesn't show, run `gh workflow run publish.yml -f mode=draft` (or `submit`) after merging.
- The run summary says which mode it chose and why: `gh run view <id>`.
