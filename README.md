# Almanac (formerly Tabby)

A Chrome extension that replaces the new tab page with a full-screen photo from the current season, your links, and the date and time, on panels of frosted glass tinted to match the photo.

It's named for the old almanacs that followed the turning seasons and the details of each day.

## Features

- **Seasonal photos.** Each new tab shows a photo from the current season. Neighboring seasons blend near their edges, and in December holiday scenes appear more often until Christmas Day.
- **Frosted panels.** The links and clock sit on tinted glass whose color comes from the photo. Six presets, or customize the layout (Corners or Center), attaching panels to the screen's corners, density, light or dark glass, blur, corner shape and size.
- **Links and link sets.** Organize links into groups, reorder them by dragging, and hide items without deleting them. Keep separate link sets (say Work and Home) and pick which one each device shows from the gear menu. Site icons are optional.
- **Clock.** Date, time, both or neither, in 12- or 24-hour format, with or without seconds.
- **Live-preview settings.** The settings page shows the real new tab as you change things.
- **Sync, import and export.** Links and settings sync through Chrome; export and import a set or everything, by file or clipboard.

## Development

There's no build step: load the repo directory unpacked.

1. Open `chrome://extensions` and turn on Developer mode.
2. Click **Load unpacked** and choose this directory.
3. Open a new tab. The gear in the top-right corner opens the link sets and settings.

Without `tints.json` (generated at publish time, and gitignored) the new tab averages each photo's color at runtime instead; generate it locally with `scripts/build-tints.sh`.

## Files

```
manifest.json      Extension manifest; its name and description are the store title and summary
new-tab.html/.js   The new tab page, also embedded as the settings page's live preview
options.html/.js   The settings page
render.js          Photo, tint, look, clock and link rendering shared by both pages
panels.css         Panel, layout and transition styles shared by both pages
storage.js         Sync storage layout, defaults and migrations
images/            Photos by season: spring, summer, autumn, winter, christmas
icons/             Extension icons: SVG sources and rendered PNGs
scripts/           build-tints.sh (runs at publish), screenshots.sh (store images), icons.sh (icon PNGs)
store/             Store listing copy, screenshots, promo tiles and promo.html (their source)
```

## Storage

Settings and each link set live in `chrome.storage.sync` under their own keys (`tabbyMeta`, `tabbySet:<name>`), so each set gets its own per-item quota. The keys keep the original name so existing users' data carries over. Which set a device shows is kept in `chrome.storage.local`, since that's per device. Nothing is sent anywhere else.

## Publishing

Every push to `release` (except store assets and docs) publishes to the Chrome Web Store through `.github/workflows/publish.yml`. The version is the manifest's major.minor plus the workflow run number. After UI changes, run `scripts/screenshots.sh` and upload the new images in the developer dashboard; the store API can't update listing images.
