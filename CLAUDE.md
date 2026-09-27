# Tabby

Chrome extension (Manifest V3): a new tab page with seasonal photos and link sets, plus a settings page that previews the real new tab. Plain HTML/CSS/JS, no build step; `release` is the default branch and every push to it publishes to the Chrome Web Store (see `.github/workflows/publish.yml`).

## Store screenshots

After any change that affects how the new tab or settings page looks (`new-tab.*`, `options.*`, `panels.css`, `render.js`, images), run `scripts/screenshots.sh` to regenerate `store/*.png`, commit them with the change, and remind the user to upload them in the Chrome Web Store developer dashboard. The store API can't update listing images, so that step is always manual.
