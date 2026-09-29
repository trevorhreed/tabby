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
  renderLinkGroups(await loadSetGroups(name));
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
// A layout change animates: the panels glide and reshape into their new
// places (see the view transition styles in panels.css).
function renderSettings(settings) {
  const layoutChanged =
    currentSettings && currentSettings.look.layout !== settings.look.layout;
  if (layoutChanged && document.startViewTransition && !reducedMotion.matches) {
    document.startViewTransition(() => applySettings(settings));
  } else {
    applySettings(settings);
  }
}

function applySettings(settings) {
  currentSettings = settings;
  applyScales(settings);
  applyLayout(settings.look);

  document.body.classList.toggle("no-favicons", !settings.showFavicons);
  document.getElementById("link-groups").style.display = settings.showLinks ? "" : "none";
  // The menu's link sets only apply while links are showing
  if (document.getElementById("menu")) renderMenu();

  // The clock panel only shows when at least one of its segments does
  const showClock = settings.showDate || settings.showTime;
  const clockSection = document.getElementById("clock");
  clockSection.style.display = showClock ? "" : "none";
  // Layouts rearrange around what's missing (see panels.css)
  document.body.classList.toggle("no-links", !settings.showLinks);
  document.body.classList.toggle("no-clock", !showClock);
  document.body.classList.toggle("nothing-shown", !settings.showLinks && !showClock);
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
      setNames = message.setNames;
      activeSetName = message.setName;
      renderSettings(message.settings);
      renderLinkGroups(message.groups);
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
  renderSettings(meta.settings);
  setInterval(() => updateClock(currentSettings), 100);

  renderLinkGroups(await loadSetGroups(activeSetName));
  initMenu();

  if (PREVIEW) initPreview();
  await showPhoto(getBackgroundImage());
  systemDark.addEventListener("change", () => {
    if (currentRgb) applyLook(currentSettings.look, currentRgb);
  });
}

document.addEventListener("DOMContentLoaded", init);
