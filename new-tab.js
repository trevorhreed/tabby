// The settings page embeds this page as its live preview (new-tab.html?preview)
// and drives it with postMessage instead of storage, so edits show before the
// debounced save lands. Preview → parent: { type: "ready" } once it's
// listening, then { type: "image", url, rgb } whenever a photo is showing.
// Parent → preview: { type: "render", settings, groups, setName, setNames } and
// { type: "image", url }.
// Only when actually framed: opened directly, parent is the page itself and
// its own messages would loop back
const PREVIEW =
  new URLSearchParams(location.search).has("preview") && window.parent !== window;

let currentSettings = null;
let currentRgb = null;
let setNames = [];
let activeSetName = null;

// The gear opens a menu: the link sets (when there's more than one to pick
// from and links are showing), a divider, then Settings. With no sets to
// offer it goes straight to settings.
const menuToggle = () => document.getElementById("menu-toggle");
const menu = () => document.getElementById("menu");

const showsSets = () => currentSettings.showLinks && setNames.length > 1;

function renderMenu() {
  const el = menu();
  el.innerHTML = "";
  if (showsSets()) {
    setNames.forEach((name) => {
      const item = document.createElement("button");
      item.className = "menu-item";
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", name === activeSetName);
      item.textContent = name;
      item.addEventListener("click", () => switchSet(name));
      el.appendChild(item);
    });
    const divider = document.createElement("div");
    divider.className = "menu-divider";
    divider.setAttribute("role", "separator");
    el.appendChild(divider);
  }
  const settings = document.createElement("button");
  settings.className = "menu-item";
  settings.setAttribute("role", "menuitem");
  settings.textContent = "Settings";
  settings.addEventListener("click", openSettings);
  el.appendChild(settings);
}

function setMenuOpen(open) {
  menu().hidden = !open;
  menuToggle().setAttribute("aria-expanded", open);
}

function openSettings() {
  setMenuOpen(false);
  chrome.runtime.openOptionsPage();
}

async function switchSet(name) {
  setMenuOpen(false);
  if (name === activeSetName) return;
  activeSetName = name;
  await setActiveSetName(name);
  showLinkGroups(await loadSetGroups(name));
  renderMenu();
}

function initMenu() {
  renderMenu();
  menuToggle().addEventListener("click", () => {
    if (!showsSets()) return openSettings();
    setMenuOpen(menu().hidden);
    if (!menu().hidden) menu().querySelector(".menu-item")?.focus();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".top-controls")) setMenuOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu().hidden) {
      setMenuOpen(false);
      menuToggle().focus();
    }
  });
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Applies everything settings control; safe to call again with new settings.
// Changes that move the panels (layout, attaching them to the corners)
// animate: the panels glide and reshape into their new places (see the
// view transition styles in panels.css).
function renderSettings(settings) {
  const layoutChanged =
    currentSettings && currentSettings.look.layout !== settings.look.layout;
  const attachChanged =
    currentSettings && currentSettings.look.attached !== settings.look.attached;
  if ((layoutChanged || attachChanged) && document.startViewTransition && !reducedMotion.matches) {
    // Tells panels.css which panels move, so only those animate (the gear
    // stays put on a layout change, the Center panel on an attach change)
    const root = document.documentElement.classList;
    root.toggle("moving-layout", layoutChanged);
    root.toggle("moving-attach", attachChanged);
    const transition = document.startViewTransition(() => applySettings(settings));
    transition.finished.finally(() => root.remove("moving-layout", "moving-attach"));
  } else {
    applySettings(settings);
  }
}

function applySettings(settings) {
  currentSettings = settings;
  applyScales(settings);
  applyLayout(settings.look);

  document.body.classList.toggle("no-favicons", !settings.showFavicons);
  // The menu's link sets only apply while links are showing
  if (document.getElementById("menu")) renderMenu();
  updatePanels();
  updateClock(settings);

  if (currentRgb) applyLook(settings.look, currentRgb);
}

// Shows or hides the panels for what there is to show. The links panel
// hides when links are turned off or the current set has nothing visible
// (an empty set, or every group and link hidden), and the layouts
// rearrange around whatever's missing (see panels.css).
function updatePanels() {
  const settings = currentSettings;
  const linksPanel = document.getElementById("link-groups");
  const showLinks = settings.showLinks && linksPanel.childElementCount > 0;
  const showClock = settings.showDate || settings.showTime;
  linksPanel.style.display = showLinks ? "" : "none";
  document.getElementById("clock").style.display = showClock ? "" : "none";
  document.body.classList.toggle("no-links", !showLinks);
  document.body.classList.toggle("no-clock", !showClock);
  document.body.classList.toggle("nothing-shown", !showLinks && !showClock);
}

function showLinkGroups(groups) {
  renderLinkGroups(groups);
  updatePanels();
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
  window.addEventListener("message", async (e) => {
    if (e.source !== parent) return;
    const message = e.data;
    if (message.type === "render") {
      // Site icons may have just been allowed on the settings page
      if (message.settings.showFavicons) await checkFaviconPermission();
      setNames = message.setNames;
      activeSetName = message.setName;
      renderSettings(message.settings);
      showLinkGroups(message.groups);
    } else if (message.type === "image") {
      showPhoto(message.url);
    }
  });
  parent.postMessage({ type: "ready" }, "*");
}

async function init() {
  const meta = await loadMeta();
  setNames = meta.setNames;
  activeSetName = await getActiveSetName(setNames);
  await checkFaviconPermission();
  renderSettings(meta.settings);
  setInterval(() => updateClock(currentSettings), 100);

  showLinkGroups(await loadSetGroups(activeSetName));
  initMenu();

  if (PREVIEW) initPreview();
  await showPhoto(getBackgroundImage());
  systemDark.addEventListener("change", () => {
    if (currentRgb) applyLook(currentSettings.look, currentRgb);
  });
}

document.addEventListener("DOMContentLoaded", init);
