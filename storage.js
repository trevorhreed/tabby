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
  showClock: true,
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

// One-time conversion from the legacy single-key format: tabbyData held
// settings and groups together (the oldest versions stored a bare groups
// array). Runs on whichever page first sees no tabbyMeta in sync storage.
async function migrateLegacyData() {
  const legacy = (await syncGet([LEGACY_SYNC_KEY]))[LEGACY_SYNC_KEY];
  let settings = { ...defaultSettings };
  let groups = defaultGroups;
  // Handle old array format
  if (Array.isArray(legacy)) {
    groups = legacy;
  } else if (legacy) {
    settings = { ...defaultSettings, ...legacy.settings };
    groups = legacy.groups || [];
  }
  const meta = { settings, setNames: [DEFAULT_SET_NAME] };
  await syncSet({
    [SYNC_META_KEY]: meta,
    [setKey(DEFAULT_SET_NAME)]: { groups },
  });
  if (legacy !== undefined) {
    await syncRemove([LEGACY_SYNC_KEY]);
  }
  return meta;
}

async function loadMeta() {
  const meta = (await syncGet([SYNC_META_KEY]))[SYNC_META_KEY];
  return meta || migrateLegacyData();
}

async function loadSetGroups(name) {
  const set = (await syncGet([setKey(name)]))[setKey(name)];
  return set ? set.groups : [];
}

// Falls back to the first set when the stored name no longer exists
// (e.g. the set was renamed or deleted on another device).
async function getActiveSetName(setNames) {
  const name = (await localGet([LOCAL_ACTIVE_SET_KEY]))[LOCAL_ACTIVE_SET_KEY];
  return setNames.includes(name) ? name : setNames[0];
}

const setActiveSetName = (name) => localSet({ [LOCAL_ACTIVE_SET_KEY]: name });
