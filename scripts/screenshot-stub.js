// Stand-in for the extension APIs so the pages render as plain files for
// store screenshots (see screenshots.sh). Query parameters, read from the top
// page so the settings preview frame matches its parent:
//   look=<json>      saved look settings; also seeds sample link sets
//   date=YYYY-MM-DD  the date the pages see, which picks the season's photos
//   tab=<name>       settings tab to open (read by options.js itself)
(() => {
  let params;
  try {
    params = new URLSearchParams(window.top.location.search);
  } catch {
    params = new URLSearchParams(location.search);
  }

  // Fixed clock and randomness so every run produces the same images
  const [year, month, day] = (params.get("date") || "2026-10-14").split("-").map(Number);
  const FIXED = new Date(year, month - 1, day, 9, 41, 0).getTime();
  const RealDate = Date;
  window.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [FIXED]));
    }
    static now() {
      return FIXED;
    }
  };
  Math.random = () => 0.5;

  const store = { sync: {}, local: {} };
  const link = (label, url) => ({ label, url, hide: false });
  store.sync.tabbyMeta = {
    // Site icons are off by default but worth showing in the store shots
    settings: { showFavicons: true, look: JSON.parse(params.get("look") || "{}") },
    setNames: ["Work", "Home"],
  };
  store.sync["tabbySet:Work"] = {
    groups: [
      {
        label: "Development",
        hide: false,
        links: [
          link("GitHub", "https://github.com"),
          link("MDN", "https://developer.mozilla.org"),
          link("Stack Overflow", "https://stackoverflow.com"),
        ],
      },
      {
        label: "Reading",
        hide: false,
        links: [link("Hacker News", "https://news.ycombinator.com"), link("Wikipedia", "https://wikipedia.org")],
      },
      {
        label: "Tools",
        hide: false,
        links: [link("Calendar", "https://calendar.google.com"), link("Mail", "https://mail.google.com")],
      },
    ],
  };
  store.sync["tabbySet:Home"] = { groups: [] };

  const area = (name) => ({
    get: (keys, callback) => {
      const out = {};
      for (const key of [].concat(keys)) {
        if (key in store[name]) out[key] = structuredClone(store[name][key]);
      }
      callback(out);
    },
    set: (items, callback) => {
      Object.assign(store[name], structuredClone(items));
      callback?.();
    },
    remove: (keys, callback) => {
      for (const key of [].concat(keys)) delete store[name][key];
      callback?.();
    },
  });

  window.chrome = {
    storage: { sync: area("sync"), local: area("local") },
    runtime: {
      lastError: undefined,
      openOptionsPage() {},
      getURL: (path) => new URL(path, location.href).href,
    },
  };

  // The extension's _favicon endpoint doesn't exist here; point the icons at
  // a public favicon service instead (sample links only)
  const FAVICON_SERVICE = "https://www.google.com/s2/favicons?sz=32&domain_url=";
  new MutationObserver(() => {
    document.querySelectorAll("img.favicon:not([data-stubbed])").forEach((img) => {
      img.dataset.stubbed = "";
      const pageUrl = new URL(img.src, location.href).searchParams.get("pageUrl");
      img.src = FAVICON_SERVICE + encodeURIComponent(pageUrl);
    });
  }).observe(document, { childList: true, subtree: true });
})();
