// Shared storage layer, loaded before the page script on both pages.
//
// Layout — one sync key per link set so each set gets its own 8KB
// QUOTA_BYTES_PER_ITEM allowance instead of sharing a single key:
//   chrome.storage.sync   tabbyMeta        { schemaVersion, settings, setNames: [...] }
//   chrome.storage.sync   tabbySet:<name>  { groups: [...] }
//   chrome.storage.local  activeSet        set shown on this device (local is never synced)

// The keys keep the extension's original name, Tabby: renaming them would
// orphan every existing user's saved links
const SYNC_META_KEY = "tabbyMeta";
const SYNC_SET_PREFIX = "tabbySet:";
const LEGACY_SYNC_KEY = "tabbyData";
const LOCAL_ACTIVE_SET_KEY = "activeSet";
const DEFAULT_SET_NAME = "Default";

// Largest Size setting (200%); the settings slider's max matches
const MAX_SCALE = 2;

const defaultSettings = {
  showLinks: true,
  showDate: true,
  showTime: true,
  twelveHourClock: true,
  showFavicons: false,
  showSeconds: false,
  // Size multiplier for both new-tab panels, up to MAX_SCALE
  scale: 1,
  // Panel look; the Frost preset (see LOOK_PRESETS in render.js)
  look: {
    layout: "corners",
    style: "auto",
    blur: 12,
    corners: 1.75,
    density: "comfortable",
    // Panels in the screen's corners sit flush in them rather than floating
    attached: true,
  },
};

// Default data structure
const defaultGroups = [
  {
    label: "Development",
    hide: false,
    links: [
      { label: "GitHub", url: "https://github.com", hide: false },
      {
        label: "Stack Overflow",
        url: "https://stackoverflow.com",
        hide: false,
      },
      { label: "MDN", url: "https://developer.mozilla.org", hide: false },
    ],
  },
  {
    label: "Social",
    hide: false,
    links: [
      { label: "Twitter", url: "https://twitter.com", hide: false },
      { label: "LinkedIn", url: "https://linkedin.com", hide: false },
    ],
  },
];

const promisify = (area, method) => (arg) =>
  new Promise((resolve, reject) => {
    chrome.storage[area][method](arg, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });

// Version of the stored data's shape. Bump it, and add a step to MIGRATIONS,
// for any change that filling in defaults (backfillSettings) can't handle:
// renaming or restructuring stored fields, or changing the keys.
const SCHEMA_VERSION = 1;

// MIGRATIONS[n] upgrades a meta from version n to n + 1, in memory. They run
// in order on load; the result is only written on the next save, like
// backfilled defaults. Data from before versioning counts as version 0.
const MIGRATIONS = [
  // 0 -> 1: the links and clock had separate sizes; the links size carries
  // over as the single shared one
  (meta) => {
    const { linksScale, clockScale, ...settings } = meta.settings ?? {};
    meta.settings = { ...settings, scale: settings.scale ?? linksScale };
    return meta;
  },
];

// Set when the stored data was written by a newer version than this one.
// This version can't know what that data means, so it shows it but refuses
// to write anything, rather than saving over fields it doesn't understand.
let storedDataIsNewer = false;

const refuseIfNewer = (write) => (arg) =>
  storedDataIsNewer
    ? Promise.reject(new Error("Settings were saved by a newer version of Almanac; update this one to make changes."))
    : write(arg);

const syncGet = promisify("sync", "get");
const syncSet = refuseIfNewer(promisify("sync", "set"));
const syncRemove = refuseIfNewer(promisify("sync", "remove"));
const localGet = promisify("local", "get");
const localSet = promisify("local", "set");

const setKey = (name) => SYNC_SET_PREFIX + name;

// True when sync storage held nothing at all, so the pages are showing the
// in-memory demo defaults. Nothing is persisted in that state — a device
// whose synced data simply hasn't arrived yet must never write defaults
// over it. The demo links become real on the user's first edit (the options
// page saves meta + set on every change).
let usingUnsavedDefaults = false;

// Settings from a backup, brought up to date the same way as stored data.
// A backup made by a newer version is refused: this version can't know
// what its settings mean.
const upgradeImportedSettings = (settings, version = 0) => {
  if (version > SCHEMA_VERSION) {
    throw new Error("This backup was made by a newer version of Almanac; update this one to import it.");
  }
  let meta = { settings };
  for (let v = version; v < SCHEMA_VERSION; v++) meta = MIGRATIONS[v](meta);
  return backfillSettings(meta).settings;
};

// Brings a stored meta up to SCHEMA_VERSION: runs any migrations it's
// missing, then fills in settings added since it was written
const upgradeMeta = (meta) => {
  const version = meta.schemaVersion ?? 0;
  if (version > SCHEMA_VERSION) storedDataIsNewer = true;
  for (let v = version; v < SCHEMA_VERSION; v++) meta = MIGRATIONS[v](meta);
  meta.schemaVersion = Math.max(version, SCHEMA_VERSION);
  return backfillSettings(meta);
};

const backfillSettings = (meta) => {
  const stored = meta.settings ?? {};
  // Backfill settings added after the meta was first written; look is merged
  // a level deeper so newly added look fields get defaults too
  meta.settings = {
    ...defaultSettings,
    ...stored,
    look: { ...defaultSettings.look, ...stored.look },
    scale: Math.min(MAX_SCALE, stored.scale ?? defaultSettings.scale),
  };
  return meta;
};

// One-time conversion from the legacy single-key format: tabbyData held
// settings and groups together (the oldest versions stored a bare groups
// array). Runs on whichever page first sees no tabbyMeta in sync storage;
// concurrent runs all write identical output, so racing is harmless. The
// legacy key is intentionally NOT removed here — deleting it in the same
// pass once let a concurrent migrator read back neither key and persist
// defaults over real data. loadMeta cleans it up on a later load instead.
async function migrateLegacyData() {
  const legacy = (await syncGet([LEGACY_SYNC_KEY]))[LEGACY_SYNC_KEY];
  if (legacy === undefined) {
    // Nothing to migrate: fresh install, or sync hasn't delivered this
    // device's data yet. Show defaults in memory; write nothing.
    usingUnsavedDefaults = true;
    return upgradeMeta({ schemaVersion: SCHEMA_VERSION, setNames: [DEFAULT_SET_NAME] });
  }
  let settings = {};
  let groups;
  // Handle old array format
  if (Array.isArray(legacy)) {
    groups = legacy;
  } else {
    settings = legacy.settings || {};
    groups = legacy.groups || [];
  }
  // Re-check meta right before writing: another page may have finished the
  // same migration while we were reading. Its output is identical — use it.
  const existing = (await syncGet([SYNC_META_KEY]))[SYNC_META_KEY];
  if (existing) return upgradeMeta(existing);
  const meta = upgradeMeta({ settings, setNames: [DEFAULT_SET_NAME] });
  await syncSet({
    [SYNC_META_KEY]: meta,
    [setKey(DEFAULT_SET_NAME)]: { groups },
  });
  return meta;
}

async function loadMeta() {
  const stored = await syncGet([SYNC_META_KEY, LEGACY_SYNC_KEY]);
  const meta = stored[SYNC_META_KEY];
  if (!meta) return migrateLegacyData();
  // Meta existing proves the migration committed, so the legacy key is safe
  // to drop now, decoupled from the migration write (see migrateLegacyData).
  // Best-effort: if it fails, a later load retries.
  if (stored[LEGACY_SYNC_KEY] !== undefined) {
    syncRemove([LEGACY_SYNC_KEY]).catch(() => {});
  }
  return upgradeMeta(meta);
}

async function loadSetGroups(name) {
  const set = (await syncGet([setKey(name)]))[setKey(name)];
  if (set) return set.groups;
  // Fresh install (or sync lag): show the unsaved demo links. Cloned so page
  // edits don't mutate the shared defaults.
  return usingUnsavedDefaults && name === DEFAULT_SET_NAME
    ? structuredClone(defaultGroups)
    : [];
}

// Falls back to the first set when the stored name no longer exists
// (e.g. the set was renamed or deleted on another device).
async function getActiveSetName(setNames) {
  const name = (await localGet([LOCAL_ACTIVE_SET_KEY]))[LOCAL_ACTIVE_SET_KEY];
  return setNames.includes(name) ? name : setNames[0];
}

const setActiveSetName = (name) => localSet({ [LOCAL_ACTIVE_SET_KEY]: name });
