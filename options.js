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
  sendPreview();
  return saveAll().catch((err) => {
    showStatus("Error saving changes", "error");
    console.error(err);
  });
}

function scheduleSave() {
  sendPreview();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
}

const STATUS_MS = 3000;
// Long enough to notice a mistake and reach for Undo
const UNDO_STATUS_MS = 6000;
let statusTimer = null;

// action, when given, is { label, run } and shows as a button in the toast
function showStatus(message, type, action = null) {
  const status = document.getElementById("status");
  const button = document.getElementById("status-action");
  document.getElementById("status-text").textContent = message;
  status.className = `status show ${type}`;
  button.hidden = !action;
  button.textContent = action ? action.label : "";
  button.onclick = action
    ? () => {
        status.className = "status";
        action.run();
      }
    : null;

  clearTimeout(statusTimer);
  statusTimer = setTimeout(
    () => {
      status.className = "status";
    },
    action ? UNDO_STATUS_MS : STATUS_MS,
  );
}

// Maps settings-checkbox element ids to their settings keys
const SETTING_CHECKBOXES = {
  "show-links": "showLinks",
  "show-favicons": "showFavicons",
  "show-date": "showDate",
  "show-time": "showTime",
  "twelve-hour-clock": "twelveHourClock",
  "show-seconds": "showSeconds",
};

// Maps settings-slider element ids to their settings keys; each slider has
// a matching "<id>-value" percentage readout
const SETTING_SLIDERS = {
  "panel-scale": "scale",
};

function renderSettings() {
  renderLook();
  Object.entries(SETTING_CHECKBOXES).forEach(([id, key]) => {
    document.getElementById(id).checked = meta.settings[key];
  });
  Object.entries(SETTING_SLIDERS).forEach(([id, key]) => {
    document.getElementById(id).value = meta.settings[key];
    renderScaleValue(id, key);
  });
}

// Lets a slider's readout be clicked to type an exact number. get returns
// the current number, set applies a typed one (already clamped to
// min..max); Enter or leaving the field applies, Escape cancels.
function makeValueEditable(readout, { get, set, min, max, label }) {
  readout.tabIndex = 0;
  readout.title = `Click to type a value (${min} to ${max})`;
  const edit = () => {
    if (readout.querySelector("input")) return;
    const shown = readout.textContent;
    const input = document.createElement("input");
    input.type = "number";
    input.min = min;
    input.max = max;
    input.value = get();
    input.className = "value-input";
    input.setAttribute("aria-label", label);
    readout.textContent = "";
    readout.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (apply) => {
      if (done) return;
      done = true;
      const typed = Number(input.value);
      readout.textContent = shown;
      if (apply && input.value !== "" && Number.isFinite(typed)) {
        set(Math.min(max, Math.max(min, Math.round(typed))));
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
  };
  readout.addEventListener("click", edit);
  readout.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target === readout) edit();
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
  // Every set change (switch, rename, delete, import) re-renders the tabs, so
  // this keeps the preview showing the set being edited
  sendPreview();
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

  const hideButton = (hidden, attrs) =>
    `<button class="icon-btn${hidden ? " active" : ""}" data-action="toggle-hide" ${attrs} title="${hidden ? "Show" : "Hide"}" aria-pressed="${hidden}">${hidden ? "🙈" : "👁"}</button>`;

  editingGroups.forEach((group, groupIndex) => {
    const groupDiv = document.createElement("div");
    groupDiv.className = "group";
    groupDiv.dataset.groupIndex = groupIndex;
    const groupAttrs = `data-group="${groupIndex}"`;
    groupDiv.innerHTML = `
      <div class="group-header${group.hide ? " is-hidden" : ""}">
        <span class="drag-handle" title="Drag to reorder">&#9776;</span>
        <input type="text" value="${escapeHtml(group.label)}" placeholder="Group name" ${groupAttrs} data-field="label">
        ${hideButton(group.hide, groupAttrs)}
        <button class="icon-btn delete" data-action="delete-group" ${groupAttrs} title="Delete group">✕</button>
      </div>
      <div class="group-content">
        <div class="links-container" id="links-${groupIndex}" ${groupAttrs}></div>
        <div class="add-link-area">
          <button class="link-add" data-action="add-link" ${groupAttrs}>+ Add link</button>
        </div>
      </div>
    `;
    container.appendChild(groupDiv);

    // Render links for this group
    const linksContainer = document.getElementById(`links-${groupIndex}`);
    group.links.forEach((link, linkIndex) => {
      const linkDiv = document.createElement("div");
      linkDiv.className = "link" + (link.hide ? " is-hidden" : "");
      linkDiv.dataset.groupIndex = groupIndex;
      linkDiv.dataset.linkIndex = linkIndex;
      const linkAttrs = `data-group="${groupIndex}" data-link="${linkIndex}"`;
      linkDiv.innerHTML = `
        <span class="drag-handle" title="Drag to reorder">&#9776;</span>
        <input type="text" value="${escapeHtml(link.label)}" placeholder="Name" ${linkAttrs} data-field="label">
        <input type="url" value="${escapeHtml(link.url)}" placeholder="https://example.com" ${linkAttrs} data-field="url">
        ${hideButton(link.hide, linkAttrs)}
        <button class="icon-btn delete" data-action="delete-link" ${linkAttrs} title="Delete link">✕</button>
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

// Toast with an Undo that re-applies restore to the set it came from; if
// another set is open by then, the undo quietly does nothing
function offerUndo(message, restore) {
  const setName = editingSetName;
  showStatus(message, "info", {
    label: "Undo",
    run: () => {
      if (editingSetName !== setName) return;
      restore();
      renderGroups();
      flushSave();
    },
  });
}

function handleButtonClick(e) {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  const groupIndex = parseInt(target.dataset.group);
  const linkIndex = parseInt(target.dataset.link);

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

    case "delete-group": {
      const [removed] = editingGroups.splice(groupIndex, 1);
      renderGroups();
      flushSave();
      offerUndo(`Deleted "${removed.label}"`, () =>
        editingGroups.splice(groupIndex, 0, removed),
      );
      break;
    }

    case "toggle-hide": {
      const item = Number.isNaN(linkIndex)
        ? editingGroups[groupIndex]
        : editingGroups[groupIndex].links[linkIndex];
      item.hide = !item.hide;
      renderGroups();
      flushSave();
      break;
    }

    case "add-link":
      editingGroups[groupIndex].links.push({
        label: "New Link",
        url: "https://",
        hide: false,
      });
      renderGroups();
      flushSave();
      break;

    case "delete-link": {
      const group = editingGroups[groupIndex];
      const [removed] = group.links.splice(linkIndex, 1);
      renderGroups();
      flushSave();
      offerUndo(`Deleted "${removed.label}"`, () =>
        group.links.splice(linkIndex, 0, removed),
      );
      break;
    }

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
  let importedSettings = backfillSettings({}).settings;
  let importedSets;
  // Handle old array format
  if (Array.isArray(data)) {
    importedSets = { [DEFAULT_SET_NAME]: data };
  } else if (data && data.sets) {
    importedSettings = backfillSettings({ settings: data.settings }).settings;
    importedSets = data.sets;
  } else if (data && data.groups) {
    // Single-set format from before link sets existed
    importedSettings = backfillSettings({ settings: data.settings }).settings;
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

// ---- Look ----

const STYLE_LABELS = { auto: "Auto", dark: "Dark", light: "Light", system: "System" };
const EDGE_LABELS = { none: "None", line: "Line" };
const BLURS_PX = [0, 6, 12, 18, 24, 36, 48, 72];
const CORNERS = [
  [0, "Square"],
  [0.25, "Slight"],
  [0.5, "Soft"],
  [0.75, "Medium"],
  [1, "Round"],
  [1.5, "Rounder"],
  [2, "Pill"],
];
const CUSTOM_PRESET = "Custom";
// The drawer needs to stay readable over any photo, so it's more opaque than
// the panels it's styled after
const DRAWER_ALPHA = "e6";
const FIELD_BACKGROUND = { dark: "#0000004d", light: "#ffffff66" };

const fillSelect = (select, entries) => {
  select.innerHTML = entries
    .map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`)
    .join("");
};

const matchingPreset = (look) =>
  LOOK_PRESETS.find((preset) =>
    ["style", "blur", "edge", "tone", "corners"].every((key) => preset[key] === look[key]),
  );

function renderLook() {
  const look = meta.settings.look;
  document.querySelectorAll("#look-layout button").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.layout === look.layout);
  });
  document.querySelectorAll("#look-density button").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.density === look.density);
  });
  document.getElementById("look-preset").value = matchingPreset(look)?.name ?? CUSTOM_PRESET;
  document.getElementById("look-style").value = look.style;
  document.getElementById("look-blur").value = look.blur;
  document.getElementById("look-edge").value = look.edge;
  document.getElementById("look-corners").value = look.corners;
  renderTone();
  applyDrawerTheme();
}

// The tone's default depends on the photo (Auto) or the OS (System), so it's
// shown once the preview photo's color is known
function renderTone() {
  const look = meta.settings.look;
  const tone = previewRgb ? lookColors(look, previewRgb).tone : (look.tone ?? 0);
  const custom = look.tone !== null;
  document.getElementById("look-tone").value = tone;
  const direction =
    tone === 0 ? "Photo color" : `${tone > 0 ? "Lighter" : "Darker"} ${Math.abs(tone)}%`;
  document.getElementById("look-tone-value").textContent = custom
    ? direction
    : `${direction} (default)`;
  document.getElementById("look-tone-reset").hidden = !custom;
}

function updateLook(changes, { debounce = false } = {}) {
  Object.assign(meta.settings.look, changes);
  renderLook();
  debounce ? scheduleSave() : flushSave();
}

function setupLook() {
  fillSelect(document.getElementById("look-preset"), [
    [CUSTOM_PRESET, CUSTOM_PRESET],
    ...LOOK_PRESETS.map((preset) => [preset.name, preset.name]),
  ]);
  fillSelect(document.getElementById("look-style"), LOOK_STYLES.map((s) => [s, STYLE_LABELS[s]]));
  fillSelect(document.getElementById("look-blur"), BLURS_PX.map((b) => [b, b ? `${b}px` : "None"]));
  fillSelect(document.getElementById("look-edge"), LOOK_EDGES.map((e) => [e, EDGE_LABELS[e]]));
  fillSelect(document.getElementById("look-corners"), CORNERS);

  document.getElementById("look-layout").addEventListener("click", (e) => {
    const layout = e.target.closest("button")?.dataset.layout;
    if (layout) updateLook({ layout });
  });
  document.getElementById("look-density").addEventListener("click", (e) => {
    const density = e.target.closest("button")?.dataset.density;
    if (density) updateLook({ density });
  });
  document.getElementById("look-preset").addEventListener("change", (e) => {
    const preset = LOOK_PRESETS.find((p) => p.name === e.target.value);
    if (!preset) return;
    const { name, ...look } = preset;
    updateLook(look);
  });
  document.getElementById("look-style").addEventListener("change", (e) =>
    updateLook({ style: e.target.value }),
  );
  document.getElementById("look-blur").addEventListener("change", (e) =>
    updateLook({ blur: Number(e.target.value) }),
  );
  document.getElementById("look-edge").addEventListener("change", (e) =>
    updateLook({ edge: e.target.value }),
  );
  document.getElementById("look-corners").addEventListener("change", (e) =>
    updateLook({ corners: Number(e.target.value) }),
  );
  // Debounced while dragging, like the size sliders
  document.getElementById("look-tone").addEventListener("input", (e) =>
    updateLook({ tone: Number(e.target.value) }, { debounce: true }),
  );
  const toneSlider = document.getElementById("look-tone");
  makeValueEditable(document.getElementById("look-tone-value"), {
    // Negative is darker, positive lighter, as on the slider
    get: () => Number(toneSlider.value),
    set: (tone) => updateLook({ tone }),
    min: Number(toneSlider.min),
    max: Number(toneSlider.max),
    label: "Tone, negative darker and positive lighter",
  });
  document.getElementById("look-tone-reset").addEventListener("click", () =>
    updateLook({ tone: null }),
  );
  systemDark.addEventListener("change", renderLook);
}

// Styles the drawer after the current look over the preview photo
function applyDrawerTheme() {
  if (!previewRgb) return;
  const look = meta.settings.look;
  const colors = lookColors(look, previewRgb);
  const root = document.documentElement.style;
  root.setProperty("--drawer-background", colors.panel + DRAWER_ALPHA);
  root.setProperty("--ink", colors.text);
  root.setProperty("--field-background", FIELD_BACKGROUND[colors.resolved]);
  root.setProperty("--blur", `${look.blur}px`);
}

// ---- Preview ----

const PREVIEW_MARGIN_PX = 32;
const previewImages = allBackgroundImages();
let previewRgb = null;
let previewImage = null;

const previewFrame = () => document.getElementById("preview");

function sendPreview() {
  previewFrame().contentWindow?.postMessage(
    {
      type: "render",
      settings: meta.settings,
      groups: editingGroups,
      setName: editingSetName,
      setCount: meta.setNames.length,
    },
    "*",
  );
}

function showPreviewImage(url) {
  previewFrame().contentWindow?.postMessage({ type: "image", url }, "*");
}

// Renders the preview at full window size and scales it to fit beside the
// drawer, so the layout inside matches a real tab exactly
function fitPreview() {
  const frame = previewFrame();
  const stage = document.querySelector(".stage");
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = Math.min(
    (stage.clientWidth - 2 * PREVIEW_MARGIN_PX) / width,
    (stage.clientHeight - 2 * PREVIEW_MARGIN_PX) / height,
  );
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
  frame.style.transform = `scale(${scale})`;
  frame.parentElement.style.width = `${width * scale}px`;
  frame.parentElement.style.height = `${height * scale}px`;
}

function setupPreview() {
  const select = document.getElementById("preview-image");
  select.innerHTML = SEASONS.map((season) => {
    const options = previewImages
      .filter((url) => url.includes(`/${season}/`))
      .map((url) => `<option value="${url}">${url.split("/").pop()}</option>`)
      .join("");
    return `<optgroup label="${season}">${options}</optgroup>`;
  }).join("");
  const step = (delta) => {
    const i = previewImages.indexOf(previewImage);
    showPreviewImage(previewImages[(i + delta + previewImages.length) % previewImages.length]);
  };
  select.addEventListener("change", (e) => showPreviewImage(e.target.value));
  document.getElementById("preview-prev").addEventListener("click", () => step(-1));
  document.getElementById("preview-next").addEventListener("click", () => step(1));
  document.getElementById("preview-random").addEventListener("click", () =>
    showPreviewImage(previewImages[Math.floor(Math.random() * previewImages.length)]),
  );

  window.addEventListener("message", (e) => {
    if (e.source !== previewFrame().contentWindow) return;
    if (e.data.type === "ready") {
      sendPreview();
    } else if (e.data.type === "image") {
      previewImage = e.data.url;
      previewRgb = e.data.rgb;
      select.value = previewImage;
      document.documentElement.style.setProperty("--image", `url(${previewImage})`);
      renderLook();
    }
  });
  window.addEventListener("resize", fitPreview);
  fitPreview();
}

// ---- Drawer tabs ----

const TAB_STORAGE_KEY = "settingsTab";

function showTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.setAttribute("aria-selected", tab.dataset.tab === name);
  });
  document.querySelectorAll("section[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
  // Remembering the tab is a convenience; storage can be unavailable
  try {
    localStorage.setItem(TAB_STORAGE_KEY, name);
  } catch {}
}

function setupTabs() {
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const name = e.target.closest(".tab")?.dataset.tab;
    if (name) showTab(name);
  });
  // ?tab= opens a specific tab (the screenshot script uses it)
  let saved = new URLSearchParams(location.search).get("tab");
  try {
    saved ??= localStorage.getItem(TAB_STORAGE_KEY);
  } catch {}
  showTab(document.querySelector(`.tab[data-tab="${saved}"]`) ? saved : "look");
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

    setupTabs();
    setupLook();
    renderSettings();
    renderSetTabs();
    renderGroups();
    setupPreview();

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
      const slider = document.getElementById(id);
      makeValueEditable(document.getElementById(`${id}-value`), {
        get: () => Math.round(meta.settings[key] * 100),
        set: (percent) => {
          meta.settings[key] = percent / 100;
          slider.value = meta.settings[key];
          renderScaleValue(id, key);
          flushSave();
        },
        min: Math.round(slider.min * 100),
        max: Math.round(slider.max * 100),
        label: `${slider.labels[0]?.textContent ?? key} size in percent`,
      });
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
