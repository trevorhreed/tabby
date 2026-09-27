// The settings page embeds this page as its live preview (new-tab.html?preview)
// and drives it with postMessage instead of storage, so edits show before the
// debounced save lands. Preview → parent: { type: "ready" } once it's
// listening, then { type: "image", url, rgb } whenever a photo is showing.
// Parent → preview: { type: "render", settings, groups, setName } and
// { type: "image", url }.
// Only when actually framed: opened directly, parent is the page itself and
// its own messages would loop back
const PREVIEW =
  new URLSearchParams(location.search).has("preview") && window.parent !== window;

let currentSettings = null;
let currentRgb = null;

function initSetSwitcher(setNames, activeSetName) {
  const toggle = document.getElementById("set-switcher-toggle");
  const menu = document.getElementById("set-switcher-menu");
  toggle.textContent = activeSetName;

  const renderMenu = (currentName) => {
    menu.innerHTML = "";
    setNames.forEach((name) => {
      const item = document.createElement("a");
      item.className =
        "set-switcher-item" + (name === currentName ? " current" : "");
      item.textContent = name;
      item.addEventListener("click", async () => {
        menu.hidden = true;
        if (name === currentName) return;
        await setActiveSetName(name);
        toggle.textContent = name;
        renderLinkGroups(await loadSetGroups(name));
        renderMenu(name);
      });
      menu.appendChild(item);
    });
  };
  renderMenu(activeSetName);

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".set-switcher")) {
      menu.hidden = true;
    }
  });
}

// Applies everything settings control; safe to call again with new settings
function renderSettings(settings) {
  currentSettings = settings;
  applyScales(settings);
  applyLayout(settings.look.layout);

  // The set switcher only affects links, so it hides along with them
  const showLinks = settings.showLinks ? "" : "none";
  document.getElementById("link-groups").style.display = showLinks;
  document.getElementById("set-switcher").style.display = showLinks;

  // The clock panel only shows when at least one of its segments does
  const clockSection = document.getElementById("clock");
  clockSection.style.display =
    settings.showDate || settings.showTime ? "" : "none";
  updateClock(settings);

  if (currentRgb) applyLook(settings.look, currentRgb);
}

async function showPhoto(url) {
  currentRgb = await showBackground(url, currentSettings.look);
  if (PREVIEW) parent.postMessage({ type: "image", url, rgb: currentRgb }, "*");
}

function initPreview() {
  // Look but don't touch: clicks would navigate the frame or open menus
  document.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  window.addEventListener("message", (e) => {
    if (e.source !== parent) return;
    const message = e.data;
    if (message.type === "render") {
      renderSettings(message.settings);
      renderLinkGroups(message.groups);
      document.getElementById("set-switcher-toggle").textContent =
        message.setName;
    } else if (message.type === "image") {
      showPhoto(message.url);
    }
  });
  parent.postMessage({ type: "ready" }, "*");
}

async function init() {
  const meta = await loadMeta();
  renderSettings(meta.settings);
  setInterval(() => updateClock(currentSettings), 100);

  // Settings link
  document.getElementById("settings-link").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const activeSetName = await getActiveSetName(meta.setNames);
  renderLinkGroups(await loadSetGroups(activeSetName));
  initSetSwitcher(meta.setNames, activeSetName);

  if (PREVIEW) initPreview();
  await showPhoto(getBackgroundImage());
  systemDark.addEventListener("change", () => {
    if (currentRgb) applyLook(currentSettings.look, currentRgb);
  });
}

document.addEventListener("DOMContentLoaded", init);
