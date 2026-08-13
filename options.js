// Check if we're in a Chrome extension context
const isExtension =
  typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync;

let meta = { settings: { ...defaultSettings }, setNames: [] };
let editingSetName = null;
let editingGroups = [];
let activeSetName = null;
// Settings and groups are tracked separately: set operations (new/rename/
// duplicate/delete) persist meta immediately, which must not clear or mask
// pending group edits.
let savedSettingsJson = JSON.stringify(meta.settings);
let savedGroupsJson = JSON.stringify(editingGroups);

function saveAll() {
  return syncSet({
    [SYNC_META_KEY]: meta,
    [setKey(editingSetName)]: { groups: editingGroups },
  });
}

function markMetaSaved() {
  savedSettingsJson = JSON.stringify(meta.settings);
}

function markGroupsSaved() {
  savedGroupsJson = JSON.stringify(editingGroups);
}

function hasUnsavedGroupChanges() {
  return JSON.stringify(editingGroups) !== savedGroupsJson;
}

function hasUnsavedChanges() {
  return (
    JSON.stringify(meta.settings) !== savedSettingsJson ||
    hasUnsavedGroupChanges()
  );
}

function updateSaveButton() {
  const saveBtn = document.getElementById("save-btn");
  saveBtn.disabled = !hasUnsavedChanges();
}

function showStatus(message, type) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.className = `status show ${type}`;

  setTimeout(() => {
    status.className = "status";
  }, 3000);
}

function renderSettings() {
  document.getElementById("show-links").checked = meta.settings.showLinks;
  document.getElementById("show-clock").checked = meta.settings.showClock;
}

function renderSetControls() {
  const editingSelect = document.getElementById("editing-set-select");
  const activeSelect = document.getElementById("active-set-select");
  [editingSelect, activeSelect].forEach((select) => {
    select.innerHTML = "";
    meta.setNames.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  });
  editingSelect.value = editingSetName;
  activeSelect.value = activeSetName;
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
  if (
    hasUnsavedGroupChanges() &&
    !confirm("Discard unsaved changes to the current set?")
  ) {
    document.getElementById("editing-set-select").value = editingSetName;
    return;
  }
  editingSetName = name;
  editingGroups = await loadSetGroups(name);
  markGroupsSaved();
  renderSetControls();
  renderGroups();
  updateSaveButton();
}

function renderGroups() {
  const container = document.getElementById("groups-container");
  container.innerHTML = "";

  editingGroups.forEach((group, groupIndex) => {
    const groupDiv = document.createElement("div");
    groupDiv.className = "group";
    groupDiv.dataset.groupIndex = groupIndex;
    groupDiv.draggable = true;
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
      linkDiv.draggable = true;
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
  const field = e.target.id;
  if (field === "show-links") {
    meta.settings.showLinks = e.target.checked;
  } else if (field === "show-clock") {
    meta.settings.showClock = e.target.checked;
  }
  updateSaveButton();
}

function handleGroupChange(e) {
  const groupIndex = parseInt(e.target.dataset.group);
  const field = e.target.dataset.field;

  if (field === "label") {
    editingGroups[groupIndex].label = e.target.value;
  } else if (field === "hide") {
    editingGroups[groupIndex].hide = e.target.checked;
  }
  updateSaveButton();
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
  updateSaveButton();
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
      updateSaveButton();
      break;

    case "delete-group":
      if (confirm("Are you sure you want to delete this group?")) {
        editingGroups.splice(groupIndex, 1);
        renderGroups();
        updateSaveButton();
      }
      break;

    case "add-link":
      editingGroups[groupIndex].links.push({
        label: "New Link",
        url: "https://",
        hide: false,
      });
      renderGroups();
      updateSaveButton();
      break;

    case "delete-link":
      if (confirm("Are you sure you want to delete this link?")) {
        editingGroups[groupIndex].links.splice(linkIndex, 1);
        renderGroups();
        updateSaveButton();
      }
      break;

    case "clear-groups":
      if (confirm("Are you sure you want to clear all link groups?")) {
        editingGroups = [];
        syncSet({ [setKey(editingSetName)]: { groups: editingGroups } })
          .then(() => {
            markGroupsSaved();
            renderGroups();
            updateSaveButton();
            showStatus("Groups cleared successfully!", "success");
          })
          .catch((err) => {
            showStatus("Error clearing groups", "error");
            console.error(err);
          });
      }
      break;

    case "save":
      saveAll()
        .then(() => {
          markMetaSaved();
          markGroupsSaved();
          updateSaveButton();
          showStatus("Changes saved successfully!", "success");
        })
        .catch((err) => {
          showStatus("Error saving changes", "error");
          console.error(err);
        });
      break;

    case "new-set": {
      const name = promptForSetName("Name for the new set:");
      if (!name) break;
      meta.setNames.push(name);
      syncSet({ [SYNC_META_KEY]: meta, [setKey(name)]: { groups: [] } })
        .then(() => {
          markMetaSaved();
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
      // Copy the stored groups (not the in-memory ones) so a rename doesn't
      // silently persist unsaved edits; those stay pending under the new name.
      loadSetGroups(oldName)
        .then((groups) =>
          syncSet({ [SYNC_META_KEY]: meta, [setKey(newName)]: { groups } }),
        )
        .then(() => syncRemove([setKey(oldName)]))
        .then(() => {
          markMetaSaved();
          editingSetName = newName;
          if (activeSetName === oldName) {
            activeSetName = newName;
            return setActiveSetName(newName);
          }
        })
        .then(() => {
          renderSetControls();
          showStatus(`Renamed to "${newName}"`, "success");
        })
        .catch((err) => {
          showStatus("Error renaming set", "error");
          console.error(err);
        });
      break;
    }

    case "duplicate-set": {
      const name = promptForSetName(
        `Name for the copy of "${editingSetName}":`,
        `${editingSetName} copy`,
      );
      if (!name) break;
      meta.setNames.push(name);
      // Duplicates what's on screen, including unsaved edits
      syncSet({
        [SYNC_META_KEY]: meta,
        [setKey(name)]: { groups: editingGroups },
      })
        .then(() => {
          markMetaSaved();
          renderSetControls();
          showStatus(`Set "${name}" created`, "success");
        })
        .catch((err) => {
          showStatus("Error duplicating set", "error");
          console.error(err);
        });
      break;
    }

    case "delete-set": {
      if (meta.setNames.length === 1) {
        showStatus("Cannot delete the only set", "error");
        break;
      }
      const name = editingSetName;
      if (!confirm(`Are you sure you want to delete the set "${name}"?`))
        break;
      meta.setNames.splice(meta.setNames.indexOf(name), 1);
      const fallback = meta.setNames[0];
      syncRemove([setKey(name)])
        .then(() => syncSet({ [SYNC_META_KEY]: meta }))
        .then(async () => {
          markMetaSaved();
          if (activeSetName === name) {
            activeSetName = fallback;
            await setActiveSetName(fallback);
          }
          editingSetName = fallback;
          editingGroups = await loadSetGroups(fallback);
          markGroupsSaved();
          renderSetControls();
          renderGroups();
          updateSaveButton();
          showStatus(`Set "${name}" deleted`, "success");
        })
        .catch((err) => {
          showStatus("Error deleting set", "error");
          console.error(err);
        });
      break;
    }

    case "export": {
      const keys = meta.setNames.map(setKey);
      syncGet(keys)
        .then((result) => {
          const sets = {};
          meta.setNames.forEach((name) => {
            sets[name] = (result[setKey(name)] || { groups: [] }).groups;
          });
          document.getElementById("import-export-text").value = JSON.stringify(
            { settings: meta.settings, sets },
            null,
            2,
          );
          showStatus("Data exported to text area", "success");
        })
        .catch((err) => {
          showStatus("Error exporting data", "error");
          console.error(err);
        });
      break;
    }

    case "import":
      try {
        const text = document.getElementById("import-export-text").value;
        const data = JSON.parse(text);

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
        syncSet(items)
          .then(() => (staleKeys.length ? syncRemove(staleKeys) : undefined))
          .then(async () => {
            markMetaSaved();
            editingSetName = names.includes(editingSetName)
              ? editingSetName
              : names[0];
            editingGroups = importedSets[editingSetName];
            markGroupsSaved();
            if (!names.includes(activeSetName)) {
              activeSetName = names[0];
              await setActiveSetName(activeSetName);
            }
            renderSettings();
            renderSetControls();
            renderGroups();
            updateSaveButton();
            showStatus("Data imported successfully!", "success");
          })
          .catch((err) => {
            showStatus("Error importing data", "error");
            console.error(err);
          });
      } catch (err) {
        showStatus("Error importing data: " + err.message, "error");
        console.error(err);
      }
      break;
  }
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

    markMetaSaved();
    markGroupsSaved();

    renderSettings();
    renderSetControls();
    renderGroups();
    updateSaveButton();

    // Event listeners
    document
      .getElementById("show-links")
      .addEventListener("change", handleSettingChange);
    document
      .getElementById("show-clock")
      .addEventListener("change", handleSettingChange);

    document
      .getElementById("editing-set-select")
      .addEventListener("change", (e) => switchEditingSet(e.target.value));

    // Active set is a per-device choice, so it writes straight to
    // chrome.storage.local instead of going through the save flow
    document
      .getElementById("active-set-select")
      .addEventListener("change", async (e) => {
        activeSetName = e.target.value;
        await setActiveSetName(activeSetName);
        showStatus(`This device now shows "${activeSetName}"`, "success");
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

  // Prevent drag on inputs/buttons
  container.addEventListener("mousedown", (e) => {
    const tag = e.target.tagName.toLowerCase();
    if (tag === "input" || tag === "button" || tag === "label") {
      const draggable = e.target.closest('[draggable="true"]');
      if (draggable) {
        draggable.draggable = false;
        setTimeout(() => (draggable.draggable = true), 0);
      }
    }
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

  container.addEventListener("dragend", () => {
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
      updateSaveButton();
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
        updateSaveButton();
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
