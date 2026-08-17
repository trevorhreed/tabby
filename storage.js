// Shared storage layer, loaded before the page script on both pages.
//
// Layout — one sync key per link set so each set gets its own 8KB
// QUOTA_BYTES_PER_ITEM allowance instead of sharing a single key:
//   chrome.storage.sync   tabbyMeta        { settings, setNames: [...] }
//   chrome.storage.sync   tabbySet:<name>  { groups: [...] }
//   chrome.storage.local  activeSet        set shown on this device (local is never synced)

const SYNC_META_KEY = "tabbyMeta";
const SYNC_SET_PREFIX = "tabbySet:";
const LEGACY_SYNC_KEY = "tabbyData";
const LOCAL_ACTIVE_SET_KEY = "activeSet";
const DEFAULT_SET_NAME = "Default";

const defaultSettings = {
  showLinks: true,
  showDate: true,
  showTime: true,
  twelveHourClock: true,
  showSeconds: true,
  // Independent size multipliers for the two new-tab panels
  linksScale: 1,
  clockScale: 1,
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

const syncGet = promisify("sync", "get");
const syncSet = promisify("sync", "set");
const syncRemove = promisify("sync", "remove");
const localGet = promisify("local", "get");
const localSet = promisify("local", "set");

const setKey = (name) => SYNC_SET_PREFIX + name;

// True when sync storage held nothing at all, so the pages are showing the
// in-memory demo defaults. Nothing is persisted in that state — a device
// whose synced data simply hasn't arrived yet must never write defaults
// over it. The demo links become real on the user's first edit (the options
// page saves meta + set on every change).
let usingUnsavedDefaults = false;

const backfillSettings = (meta) => {
  // Backfill settings added after the meta was first written
  meta.settings = { ...defaultSettings, ...meta.settings };
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
    return {
      settings: { ...defaultSettings },
      setNames: [DEFAULT_SET_NAME],
    };
  }
  let settings = { ...defaultSettings };
  let groups;
  // Handle old array format
  if (Array.isArray(legacy)) {
    groups = legacy;
  } else {
    settings = { ...defaultSettings, ...legacy.settings };
    groups = legacy.groups || [];
  }
  // Re-check meta right before writing: another page may have finished the
  // same migration while we were reading. Its output is identical — use it.
  const existing = (await syncGet([SYNC_META_KEY]))[SYNC_META_KEY];
  if (existing) return backfillSettings(existing);
  const meta = { settings, setNames: [DEFAULT_SET_NAME] };
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
  return backfillSettings(meta);
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
