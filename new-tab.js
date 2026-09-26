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

async function init() {
  const meta = await loadMeta();

  applyScales(meta.settings);

  // Settings link
  document.getElementById("settings-link").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Handle showLinks setting (the set switcher only affects links, so it
  // hides along with them)
  const linkGroupsSection = document.getElementById("link-groups");
  const setSwitcher = document.getElementById("set-switcher");
  if (!meta.settings.showLinks) {
    linkGroupsSection.style.display = "none";
    setSwitcher.style.display = "none";
  } else {
    const activeSetName = await getActiveSetName(meta.setNames);
    renderLinkGroups(await loadSetGroups(activeSetName));
    initSetSwitcher(meta.setNames, activeSetName);
  }

  // The clock panel only shows when at least one of its segments does
  const clockSection = document.getElementById("clock");
  if (!meta.settings.showDate && !meta.settings.showTime) {
    clockSection.style.display = "none";
  } else {
    updateClock(meta.settings);
    setInterval(() => updateClock(meta.settings), 100);
  }

  // Set background image and colors
  const look = meta.settings.look;
  const rgb = await showBackground(getBackgroundImage(), look);
  systemDark.addEventListener("change", () => applyLook(look, rgb));
}

document.addEventListener("DOMContentLoaded", init);
