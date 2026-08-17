// Check if we're in a Chrome extension context
const isExtension =
  typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync;

// Debounce keystroke-driven saves; chrome.storage.sync throttles writes
// (120/minute), so per-keystroke writes could hit the quota
const SAVE_DEBOUNCE_MS = 500;

let meta = { settings: { ...defaultSettings }, setNames: [] };
let editingSetName = null;
let editingGroups = [];
let activeSetName = null;
let saveTimer = null;

function saveAll() {
  return syncSet({
    [SYNC_META_KEY]: meta,
    [setKey(editingSetName)]: { groups: editingGroups },
  });
}

function cancelPendingSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
}

function flushSave() {
  cancelPendingSave();
  return saveAll().catch((err) => {
    showStatus("Error saving changes", "error");
    console.error(err);
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
}

function showStatus(message, type) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.className = `status show ${type}`;

  setTimeout(() => {
    status.className = "status";
  }, 3000);
}

// Maps settings-checkbox element ids to their settings keys
const SETTING_CHECKBOXES = {
  "show-links": "showLinks",
  "show-date": "showDate",
  "show-time": "showTime",
  "twelve-hour-clock": "twelveHourClock",
  "show-seconds": "showSeconds",
};

// Maps settings-slider element ids to their settings keys; each slider has
// a matching "<id>-value" percentage readout
const SETTING_SLIDERS = {
  "links-scale": "linksScale",
  "clock-scale": "clockScale",
};

function renderSettings() {
  Object.entries(SETTING_CHECKBOXES).forEach(([id, key]) => {
    document.getElementById(id).checked = meta.settings[key];
  });
  Object.entries(SETTING_SLIDERS).forEach(([id, key]) => {
    document.getElementById(id).value = meta.settings[key];
    renderScaleValue(id, key);
  });
}

function renderScaleValue(id, key) {
  document.getElementById(`${id}-value`).textContent =
    Math.round(meta.settings[key] * 100) + "%";
}

function renderSetTabs() {
  const tabs = document.getElementById("set-tabs");
  tabs.innerHTML = "";
  meta.setNames.forEach((name) => {
    const tab = document.createElement("button");
    tab.className = "set-tab" + (name === editingSetName ? " active" : "");
    tab.textContent = name;
    tab.addEventListener("click", () => {
      if (name !== editingSetName) {
        switchEditingSet(name);
      }
    });
    tabs.appendChild(tab);
  });
  // The trailing tab always creates a new set; handleButtonClick picks it
  // up through its data-action like the other set buttons
  const newTab = document.createElement("button");
  newTab.className = "set-tab new-set-tab";
  newTab.dataset.action = "new-set";
  newTab.textContent = "+ New";
  tabs.appendChild(newTab);
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Resolves with the parsed JSON; never settles if the dialog is cancelled
// (no change event fires), which safely abandons the import
function pickJsonFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => {
      const file = input.files[0];
      if (!file) return;
      file.text().then((text) => {
        try {
          resolve(JSON.parse(text));
        } catch (err) {
          reject(err);
        }
      }, reject);
    });
    input.click();
  });
}

const toFilename = (name) => name.replace(/[^\w-]+/g, "_");

// Modal offering both export paths: copy to clipboard or download a file.
// Resolves with "clipboard", "download", or null if cancelled. Handlers are
// assigned via onclick so reopening replaces them instead of stacking.
function pickExportTarget(title) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("export-dialog");
    document.getElementById("export-dialog-title").textContent = title;
    overlay.hidden = false;

    const close = (choice) => {
      overlay.hidden = true;
      resolve(choice);
    };

    document.getElementById("export-dialog-copy").onclick = () =>
      close("clipboard");
    document.getElementById("export-dialog-download").onclick = () =>
      close("download");
    document.getElementById("export-dialog-cancel").onclick = () =>
      close(null);
    overlay.onclick = (e) => {
      if (e.target === overlay) close(null);
    };
  });
}

function exportJson(choice, filename, value) {
  if (choice === "clipboard") {
    return navigator.clipboard
      .writeText(JSON.stringify(value, null, 2))
      .then(() => showStatus("Copied to clipboard", "success"));
  }
  downloadJson(filename, value);
}

// Modal offering both import paths: upload a JSON file or paste JSON text.
// Resolves with the parsed value, or null if cancelled. A paste that fails
// to parse keeps the dialog open for correction. Handlers are assigned via
// onclick so reopening the dialog replaces them instead of stacking.
function pickJsonInput(title) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("import-dialog");
    const textarea = document.getElementById("import-dialog-text");
    document.getElementById("import-dialog-title").textContent = title;
    textarea.value = "";
    overlay.hidden = false;

    const close = (value) => {
      overlay.hidden = true;
      resolve(value);
    };

    document.getElementById("import-dialog-upload").onclick = () => {
      pickJsonFile().then(close, (err) => {
        showStatus("Error reading file: " + err.message, "error");
      });
    };
    document.getElementById("import-dialog-confirm").onclick = () => {
      try {
        close(JSON.parse(textarea.value));
      } catch (err) {
        showStatus("Invalid JSON: " + err.message, "error");
      }
    };
    document.getElementById("import-dialog-cancel").onclick = () => close(null);
    overlay.onclick = (e) => {
      if (e.target === overlay) close(null);
    };
  });
}

// allowName lets a rename keep its current name without a duplicate error
function promptForSetName(message, defaultValue = "", allowName = null) {
  const name = prompt(message, defaultValue);
  if (name === null) return null;
  const trimmed = name.trim();
  if (!trimmed) {
    showStatus("Set name cannot be empty", "error");
    return null;
  }
  if (trimmed !== allowName && meta.setNames.includes(trimmed)) {
    showStatus(`A set named "${trimmed}" already exists`, "error");
    return null;
  }
  return trimmed;
}

async function switchEditingSet(name) {
  // Flush so a pending debounced save can't land on the wrong set
  if (saveTimer) {
    await flushSave();
  }
  editingSetName = name;
  editingGroups = await loadSetGroups(name);
  // The selected tab also becomes the set this device's new tab shows
  activeSetName = name;
  await setActiveSetName(name);
  renderSetTabs();
  renderGroups();
}

function renderGroups() {
  const container = document.getElementById("groups-container");
  container.innerHTML = "";

  editingGroups.forEach((group, groupIndex) => {
    const groupDiv = document.createElement("div");
    groupDiv.className = "group";
    groupDiv.dataset.groupIndex = groupIndex;
    groupDiv.innerHTML = `
      <div class="group-header">
        <span class="drag-handle">&#9776;</span>
        <input type="text" value="${escapeHtml(group.label)}" placeholder="Group name" data-group="${groupIndex}" data-field="label">
        <label>
          <input type="checkbox" ${group.hide ? "checked" : ""} data-group="${groupIndex}" data-field="hide"> Hide
        </label>
        <button class="btn btn-danger btn-small" data-action="delete-group" data-group="${groupIndex}">Delete Group</button>
      </div>
      <div class="group-content">
        <div class="links-container" id="links-${groupIndex}" data-group="${groupIndex}"></div>
        <div class="add-link-area">
          <button class="btn btn-primary btn-small" data-action="add-link" data-group="${groupIndex}">Add Link</button>
        </div>
      </div>
    `;
    container.appendChild(groupDiv);

    // Render links for this group
    const linksContainer = document.getElementById(`links-${groupIndex}`);
    group.links.forEach((link, linkIndex) => {
      const linkDiv = document.createElement("div");
      linkDiv.className = "link";
      linkDiv.dataset.groupIndex = groupIndex;
      linkDiv.dataset.linkIndex = linkIndex;
      linkDiv.innerHTML = `
        <span class="drag-handle">&#9776;</span>
        <input type="text" value="${escapeHtml(link.label)}" placeholder="Link name" data-group="${groupIndex}" data-link="${linkIndex}" data-field="label">
        <input type="url" value="${escapeHtml(link.url)}" placeholder="https://example.com" data-group="${groupIndex}" data-link="${linkIndex}" data-field="url">
        <label>
          <input type="checkbox" ${link.hide ? "checked" : ""} data-group="${groupIndex}" data-link="${linkIndex}" data-field="hide"> Hide
        </label>
        <div class="link-actions">
          <button class="btn btn-danger btn-small" data-action="delete-link" data-group="${groupIndex}" data-link="${linkIndex}">Delete</button>
        </div>
      `;
      linksContainer.appendChild(linkDiv);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function handleSettingChange(e) {
  const key = SETTING_CHECKBOXES[e.target.id];
  if (key) {
    meta.settings[key] = e.target.checked;
  }
  flushSave();
}

function handleGroupChange(e) {
  const groupIndex = parseInt(e.target.dataset.group);
  const field = e.target.dataset.field;

  if (field === "label") {
    editingGroups[groupIndex].label = e.target.value;
  } else if (field === "hide") {
    editingGroups[groupIndex].hide = e.target.checked;
  }
  scheduleSave();
}

function handleLinkChange(e) {
  const groupIndex = parseInt(e.target.dataset.group);
  const linkIndex = parseInt(e.target.dataset.link);
  const field = e.target.dataset.field;

  if (field === "label") {
    editingGroups[groupIndex].links[linkIndex].label = e.target.value;
  } else if (field === "url") {
    editingGroups[groupIndex].links[linkIndex].url = e.target.value;
  } else if (field === "hide") {
    editingGroups[groupIndex].links[linkIndex].hide = e.target.checked;
  }
  scheduleSave();
}

function handleButtonClick(e) {
  const action = e.target.dataset.action;
  if (!action) return;

  const groupIndex = parseInt(e.target.dataset.group);
  const linkIndex = parseInt(e.target.dataset.link);

  switch (action) {
    case "add-group":
      editingGroups.push({
        label: "New Group",
        hide: false,
        links: [],
      });
      renderGroups();
      flushSave();
      break;

    case "delete-group":
      if (confirm("Are you sure you want to delete this group?")) {
        editingGroups.splice(groupIndex, 1);
        renderGroups();
        flushSave();
      }
      break;

    case "add-link":
      editingGroups[groupIndex].links.push({
        label: "New Link",
        url: "https://",
        hide: false,
      });
      renderGroups();
      flushSave();
      break;

    case "delete-link":
      if (confirm("Are you sure you want to delete this link?")) {
        editingGroups[groupIndex].links.splice(linkIndex, 1);
        renderGroups();
        flushSave();
      }
      break;

    case "clear-groups":
      if (confirm("Are you sure you want to clear all link groups?")) {
        editingGroups = [];
        renderGroups();
        flushSave().then(() => {
          showStatus("Groups cleared successfully!", "success");
        });
      }
      break;

    case "new-set": {
      const name = promptForSetName("Name for the new set:");
      if (!name) break;
      meta.setNames.push(name);
      syncSet({ [SYNC_META_KEY]: meta, [setKey(name)]: { groups: [] } })
        .then(() => {
          switchEditingSet(name);
          showStatus(`Set "${name}" created`, "success");
        })
        .catch((err) => {
          showStatus("Error creating set", "error");
          console.error(err);
        });
      break;
    }

    case "rename-set": {
      const oldName = editingSetName;
      const newName = promptForSetName(
        `Rename "${oldName}" to:`,
        oldName,
        oldName,
      );
      if (!newName || newName === oldName) break;
      meta.setNames[meta.setNames.indexOf(oldName)] = newName;
      editingSetName = newName;
      // flushSave writes the groups under the new key; the old key just
      // needs removing
      flushSave()
        .then(() => syncRemove([setKey(oldName)]))
        .then(() => {
          if (activeSetName === oldName) {
            activeSetName = newName;
            return setActiveSetName(newName);
          }
        })
        .then(() => {
          renderSetTabs();
          showStatus(`Renamed to "${newName}"`, "success");
        })
        .catch((err) => {
          showStatus("Error renaming set", "error");
          console.error(err);
        });
      break;
    }

    case "export-set":
      pickExportTarget(`Export "${editingSetName}"`)
        .then((choice) => {
          if (!choice) return;
          return exportJson(
            choice,
            `tabby-set-${toFilename(editingSetName)}.json`,
            { groups: editingGroups },
          );
        })
        .catch((err) => {
          showStatus("Error exporting set", "error");
          console.error(err);
        });
      break;

    case "import-set":
      pickJsonInput(`Import Into "${editingSetName}"`)
        .then((data) => {
          if (data === null) return;
          // Accepts a bare groups array or a { groups } export
          const groups = Array.isArray(data) ? data : data && data.groups;
          if (!Array.isArray(groups)) {
            throw new Error("Expected a groups array or { groups } object");
          }
          editingGroups = groups;
          renderGroups();
          return flushSave().then(() => {
            showStatus(`Imported into "${editingSetName}"`, "success");
          });
        })
        .catch((err) => {
          showStatus("Error importing set: " + err.message, "error");
          console.error(err);
        });
      break;

    case "delete-set": {
      if (meta.setNames.length === 1) {
        showStatus("Cannot delete the only set", "error");
        break;
      }
      const name = editingSetName;
      if (!confirm(`Are you sure you want to delete the set "${name}"?`))
        break;
      // Drop any pending save aimed at the doomed set
      cancelPendingSave();
      meta.setNames.splice(meta.setNames.indexOf(name), 1);
      const fallback = meta.setNames[0];
      syncRemove([setKey(name)])
        .then(() => syncSet({ [SYNC_META_KEY]: meta }))
        .then(async () => {
          if (activeSetName === name) {
            activeSetName = fallback;
            await setActiveSetName(fallback);
          }
          editingSetName = fallback;
          editingGroups = await loadSetGroups(fallback);
          renderSetTabs();
          renderGroups();
          showStatus(`Set "${name}" deleted`, "success");
        })
        .catch((err) => {
          showStatus("Error deleting set", "error");
          console.error(err);
        });
      break;
    }

    case "export":
      pickExportTarget("Export All Data")
        .then((choice) => {
          if (!choice) return;
          const keys = meta.setNames.map(setKey);
          return syncGet(keys).then((result) => {
            const sets = {};
            meta.setNames.forEach((name) => {
              sets[name] = (result[setKey(name)] || { groups: [] }).groups;
            });
            return exportJson(choice, "tabby-backup.json", {
              settings: meta.settings,
              sets,
            });
          });
        })
        .catch((err) => {
          showStatus("Error exporting data", "error");
          console.error(err);
        });
      break;

    case "import":
      pickJsonInput("Import All Data")
        .then((data) => {
          if (data === null) return;
          return importAllData(data);
        })
        .catch((err) => {
          showStatus("Error importing data: " + err.message, "error");
          console.error(err);
        });
      break;
  }
}

async function importAllData(data) {
  // A pending save could restore pre-import state under a stale key
  cancelPendingSave();
  let importedSettings = { ...defaultSettings };
  let importedSets;
  // Handle old array format
  if (Array.isArray(data)) {
    importedSets = { [DEFAULT_SET_NAME]: data };
  } else if (data && data.sets) {
    importedSettings = { ...defaultSettings, ...data.settings };
    importedSets = data.sets;
  } else if (data && data.groups) {
    // Single-set format from before link sets existed
    importedSettings = { ...defaultSettings, ...data.settings };
    importedSets = { [DEFAULT_SET_NAME]: data.groups };
  } else {
    throw new Error("Unrecognized data format");
  }

  // Validate
  const names = Object.keys(importedSets);
  if (names.length === 0) {
    throw new Error("At least one link set is required");
  }
  names.forEach((name) => {
    if (!Array.isArray(importedSets[name])) {
      throw new Error(`Groups for set "${name}" must be an array`);
    }
  });

  const staleKeys = meta.setNames
    .filter((name) => !names.includes(name))
    .map(setKey);
  meta = { settings: importedSettings, setNames: names };
  const items = { [SYNC_META_KEY]: meta };
  names.forEach((name) => {
    items[setKey(name)] = { groups: importedSets[name] };
  });
  await syncSet(items);
  if (staleKeys.length) {
    await syncRemove(staleKeys);
  }
  editingSetName = names.includes(editingSetName) ? editingSetName : names[0];
  editingGroups = importedSets[editingSetName];
  if (!names.includes(activeSetName)) {
    activeSetName = names[0];
    await setActiveSetName(activeSetName);
  }
  renderSettings();
  renderSetTabs();
  renderGroups();
  showStatus("Data imported successfully!", "success");
}

async function init() {
  if (!isExtension) {
    showStatus(
      "This page must be loaded as a Chrome extension to work properly",
      "error",
    );
    return;
  }

  try {
    meta = await loadMeta();
    activeSetName = await getActiveSetName(meta.setNames);
    editingSetName = activeSetName;
    editingGroups = await loadSetGroups(editingSetName);

    renderSettings();
    renderSetTabs();
    renderGroups();

    // Best-effort flush of a debounced save if the page closes mid-typing
    window.addEventListener("beforeunload", () => {
      if (saveTimer) {
        flushSave();
      }
    });

    // Event listeners
    Object.keys(SETTING_CHECKBOXES).forEach((id) => {
      document
        .getElementById(id)
        .addEventListener("change", handleSettingChange);
    });

    // Debounced while dragging, so the sliders don't burn write quota
    Object.entries(SETTING_SLIDERS).forEach(([id, key]) => {
      document.getElementById(id).addEventListener("input", (e) => {
        meta.settings[key] = parseFloat(e.target.value);
        renderScaleValue(id, key);
        scheduleSave();
      });
    });

    document.addEventListener("input", (e) => {
      if (
        e.target.dataset.group !== undefined &&
        e.target.dataset.link !== undefined
      ) {
        handleLinkChange(e);
      } else if (e.target.dataset.group !== undefined) {
        handleGroupChange(e);
      }
    });

    document.addEventListener("change", (e) => {
      if (
        e.target.type === "checkbox" &&
        e.target.dataset.group !== undefined &&
        e.target.dataset.link !== undefined
      ) {
        handleLinkChange(e);
      } else if (
        e.target.type === "checkbox" &&
        e.target.dataset.group !== undefined
      ) {
        handleGroupChange(e);
      }
    });

    document.addEventListener("click", handleButtonClick);

    // Drag and drop for groups and links
    setupDragAndDrop();
  } catch (error) {
    showStatus("Error loading data: " + error.message, "error");
    console.error("Load error:", error);
  }
}

// Drag and drop state
let dragType = null;
let dragFromGroupIndex = null;
let dragFromLinkIndex = null;
let dragAndDropSetup = false;
let placeholder = null;

function createPlaceholder(type) {
  const el = document.createElement("div");
  el.className = `drag-placeholder drag-placeholder-${type}`;
  if (type === "group") {
    el.innerHTML = '<div class="placeholder-inner">Drop group here</div>';
  } else {
    el.innerHTML = '<div class="placeholder-inner">Drop link here</div>';
  }
  return el;
}

function removePlaceholder() {
  if (placeholder && placeholder.parentNode) {
    placeholder.parentNode.removeChild(placeholder);
  }
  placeholder = null;
}

function setupDragAndDrop() {
  if (dragAndDropSetup) return;
  dragAndDropSetup = true;

  const container = document.getElementById("groups-container");

  // Drag only via the handles: an item becomes draggable on handle mousedown,
  // so text selection in inputs never starts a drag
  container.addEventListener("mousedown", (e) => {
    if (!e.target.closest(".drag-handle")) return;
    const item = e.target.closest(".link, .group");
    if (item) item.draggable = true;
  });

  // Mousedown on a handle without a drag leaves draggable set — clear it
  document.addEventListener("mouseup", () => {
    container
      .querySelectorAll('[draggable="true"]')
      .forEach((el) => (el.draggable = false));
  });

  container.addEventListener("dragstart", (e) => {
    const link = e.target.closest(".link");
    const group = e.target.closest(".group");

    if (link) {
      dragType = "link";
      dragFromGroupIndex = parseInt(link.dataset.groupIndex);
      dragFromLinkIndex = parseInt(link.dataset.linkIndex);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "");
      placeholder = createPlaceholder("link");
      requestAnimationFrame(() => link.classList.add("dragging"));
    } else if (group) {
      dragType = "group";
      dragFromGroupIndex = parseInt(group.dataset.groupIndex);
      dragFromLinkIndex = null;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "");
      placeholder = createPlaceholder("group");
      requestAnimationFrame(() => group.classList.add("dragging"));
    }
  });

  container.addEventListener("dragend", (e) => {
    e.target.draggable = false;
    document
      .querySelectorAll(".dragging")
      .forEach((el) => el.classList.remove("dragging"));
    removePlaceholder();
    dragType = null;
    dragFromGroupIndex = null;
    dragFromLinkIndex = null;
  });

  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    if (!placeholder) return;

    if (dragType === "group") {
      const group = e.target.closest(".group");
      if (group && !group.classList.contains("dragging")) {
        const rect = group.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        // Remove placeholder first to avoid layout issues
        if (placeholder.parentNode) {
          placeholder.parentNode.removeChild(placeholder);
        }

        if (e.clientY < midY) {
          group.parentNode.insertBefore(placeholder, group);
        } else {
          group.parentNode.insertBefore(placeholder, group.nextSibling);
        }
      } else if (!group && e.target === container) {
        container.appendChild(placeholder);
      }
    } else if (dragType === "link") {
      const link = e.target.closest(".link");
      const linksContainer = e.target.closest(".links-container");

      if (link && !link.classList.contains("dragging")) {
        const rect = link.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        // Remove placeholder first to avoid layout issues
        if (placeholder.parentNode) {
          placeholder.parentNode.removeChild(placeholder);
        }

        if (e.clientY < midY) {
          link.parentNode.insertBefore(placeholder, link);
        } else {
          link.parentNode.insertBefore(placeholder, link.nextSibling);
        }
      } else if (linksContainer && !link) {
        // Empty container or hovering over container but not a link
        if (!linksContainer.contains(placeholder)) {
          linksContainer.appendChild(placeholder);
        }
      }
    }
  });

  container.addEventListener("dragleave", (e) => {
    // Remove placeholder if leaving the container entirely
    if (e.target === container && !container.contains(e.relatedTarget)) {
      removePlaceholder();
      if (dragType) {
        placeholder = createPlaceholder(dragType);
      }
    }
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault();

    if (dragType === "group" && placeholder && placeholder.parentNode) {
      // Find where placeholder is in the DOM
      let toIndex = 0;

      for (let i = 0; i < container.children.length; i++) {
        const child = container.children[i];
        if (child === placeholder) {
          break;
        }
        if (
          child.classList.contains("group") &&
          !child.classList.contains("dragging")
        ) {
          toIndex++;
        }
      }

      // Remove from source first
      const [movedGroup] = editingGroups.splice(dragFromGroupIndex, 1);
      // Insert at new position (no adjustment needed - we already skipped dragged item when counting)
      editingGroups.splice(toIndex, 0, movedGroup);
      renderGroups();
      flushSave();
    } else if (dragType === "link" && placeholder && placeholder.parentNode) {
      const linksContainer = placeholder.closest(".links-container");
      if (linksContainer) {
        const toGroupIndex = parseInt(linksContainer.dataset.group);
        const movedLink =
          editingGroups[dragFromGroupIndex].links[dragFromLinkIndex];

        // Find position of placeholder (skipping dragged item)
        let toLinkIndex = 0;
        for (let i = 0; i < linksContainer.children.length; i++) {
          const child = linksContainer.children[i];
          if (child === placeholder) {
            break;
          }
          if (
            child.classList.contains("link") &&
            !child.classList.contains("dragging")
          ) {
            toLinkIndex++;
          }
        }

        // Remove from source
        editingGroups[dragFromGroupIndex].links.splice(dragFromLinkIndex, 1);

        // Insert at new position (no adjustment needed - we already skipped dragged item when counting)
        editingGroups[toGroupIndex].links.splice(toLinkIndex, 0, movedLink);
        renderGroups();
        flushSave();
      }
    }

    // Cleanup
    removePlaceholder();
    document
      .querySelectorAll(".dragging")
      .forEach((el) => el.classList.remove("dragging"));
  });
}

document.addEventListener("DOMContentLoaded", init);
