# Tabby Chrome Extension

A beautiful Chrome extension that manages your links with seasonal backgrounds and synchronized data.

## Features

- **Seasonal Backgrounds**: Automatically changes background images based on the current season
- **Sync Storage**: Your links are synchronized across all your Chrome instances
- **Link Management**: Add, delete, and organize links in groups
- **Beautiful UI**: Dynamic color scheme that adapts to the background image
- **Export/Import**: Backup and restore your data
- **Real-time Clock**: Shows current time and date

## Installation

1. Download or clone this extension
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension icon will appear in your toolbar

## Usage

- Click the extension icon to open the popup
- Browse your organized links by group
- Right-click any link to delete it
- Use the "Add New Link" section to add new links
- Export your data for backup or import from a previous backup

## Data Storage

All data is stored in Chrome's sync storage, which means:
- Your links sync across all devices where you're signed in to Chrome
- Data persists even if you uninstall/reinstall the extension
- Maximum storage is 100KB (plenty for thousands of links)

## Seasonal Images

The extension includes 72 seasonal background images (18 for each season):
- **Spring**: Fresh and vibrant scenes
- **Summer**: Bright and warm imagery  
- **Autumn**: Rich and colorful fall scenes
- **Winter**: Cool and serene winter landscapes

Images are randomly selected based on the current month with seasonal transitions.

## File Structure

```
chrome-extension-tabby/
├── manifest.json          # Extension configuration
├── popup.html             # Main popup interface
├── popup.js              # Core functionality and Chrome storage
├── icons/                # Extension icons
├── images/               # Seasonal background images
│   ├── spring/          
│   ├── summer/
│   ├── autumn/
│   └── winter/
└── README.md            # This file
```

## Development

The extension uses:
- Chrome Extension Manifest V3
- Chrome Storage Sync API
- Canvas API for image color extraction
- Vanilla JavaScript (no frameworks)

## Privacy

This extension:
- Only stores your link data in Chrome's sync storage
- Does not transmit any data to external servers
- Does not require any special permissions beyond storage
- Background images are bundled locally with the extension