// Default data structure
const defaultData = {
  settings: {
    showLinks: true,
    showClock: true,
  },
  groups: [
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
  ],
};

// Check if we're in a Chrome extension context
const isExtension =
  typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync;

let tabbyData = { settings: { showLinks: true, showClock: true }, groups: [] };
let savedDataJson = JSON.stringify(tabbyData);

async function loadData() {
  if (!isExtension) {
    throw new Error(
      "This page must be loaded as a Chrome extension to access synced storage",
    );
  }

  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(["tabbyData"], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result.tabbyData || defaultData);
      }
    });
  });
}

async function saveDataToStorage(data) {
  if (!isExtension) {
    throw new Error(
      "This page must be loaded as a Chrome extension to access synced storage",
    );
  }

  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ tabbyData: data }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

function hasUnsavedChanges() {
  return JSON.stringify(tabbyData) !== savedDataJson;
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
  document.getElementById("show-links").checked = tabbyData.settings.showLinks;
  document.getElementById("show-clock").checked = tabbyData.settings.showClock;
}

function renderGroups() {
  const container = document.getElementById("groups-container");
  container.innerHTML = "";

  tabbyData.groups.forEach((group, groupIndex) => {
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
    tabbyData.settings.showLinks = e.target.checked;
  } else if (field === "show-clock") {
    tabbyData.settings.showClock = e.target.checked;
  }
  updateSaveButton();
}

function handleGroupChange(e) {
  const groupIndex = parseInt(e.target.dataset.group);
  const field = e.target.dataset.field;

  if (field === "label") {
    tabbyData.groups[groupIndex].label = e.target.value;
  } else if (field === "hide") {
    tabbyData.groups[groupIndex].hide = e.target.checked;
  }
  updateSaveButton();
}

function handleLinkChange(e) {
  const groupIndex = parseInt(e.target.dataset.group);
  const linkIndex = parseInt(e.target.dataset.link);
  const field = e.target.dataset.field;

  if (field === "label") {
    tabbyData.groups[groupIndex].links[linkIndex].label = e.target.value;
  } else if (field === "url") {
    tabbyData.groups[groupIndex].links[linkIndex].url = e.target.value;
  } else if (field === "hide") {
    tabbyData.groups[groupIndex].links[linkIndex].hide = e.target.checked;
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
      tabbyData.groups.push({
        label: "New Group",
        hide: false,
        links: [],
      });
      renderGroups();
      updateSaveButton();
      break;

    case "delete-group":
      if (confirm("Are you sure you want to delete this group?")) {
        tabbyData.groups.splice(groupIndex, 1);
        renderGroups();
        updateSaveButton();
      }
      break;

    case "add-link":
      tabbyData.groups[groupIndex].links.push({
        label: "New Link",
        url: "https://",
        hide: false,
      });
      renderGroups();
      updateSaveButton();
      break;

    case "delete-link":
      if (confirm("Are you sure you want to delete this link?")) {
        tabbyData.groups[groupIndex].links.splice(linkIndex, 1);
        renderGroups();
        updateSaveButton();
      }
      break;

    case "clear-groups":
      if (confirm("Are you sure you want to clear all link groups?")) {
        tabbyData.groups = [];
        saveDataToStorage(tabbyData)
          .then(() => {
            savedDataJson = JSON.stringify(tabbyData);
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
      saveDataToStorage(tabbyData)
        .then(() => {
          savedDataJson = JSON.stringify(tabbyData);
          updateSaveButton();
          showStatus("Changes saved successfully!", "success");
        })
        .catch((err) => {
          showStatus("Error saving changes", "error");
          console.error(err);
        });
      break;

    case "export":
      document.getElementById("import-export-text").value = JSON.stringify(
        tabbyData,
        null,
        2,
      );
      showStatus("Data exported to text area", "success");
      break;

    case "import":
      try {
        const text = document.getElementById("import-export-text").value;
        const data = JSON.parse(text);

        // Handle old array format
        let importedData;
        if (Array.isArray(data)) {
          importedData = {
            settings: { showLinks: true, showClock: true },
            groups: data,
          };
        } else {
          importedData = data;
          if (!importedData.settings) {
            importedData.settings = { showLinks: true, showClock: true };
          }
        }

        // Validate
        if (!Array.isArray(importedData.groups)) {
          throw new Error("Groups data must be an array");
        }

        tabbyData = importedData;
        saveDataToStorage(tabbyData)
          .then(() => {
            savedDataJson = JSON.stringify(tabbyData);
            renderSettings();
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
    const loadedData = await loadData();

    // Handle old array format
    if (Array.isArray(loadedData)) {
      tabbyData = {
        settings: { showLinks: true, showClock: true },
        groups: loadedData,
      };
    } else {
      tabbyData = loadedData;
    }

    savedDataJson = JSON.stringify(tabbyData);

    renderSettings();
    renderGroups();
    updateSaveButton();

    // Event listeners
    document
      .getElementById("show-links")
      .addEventListener("change", handleSettingChange);
    document
      .getElementById("show-clock")
      .addEventListener("change", handleSettingChange);

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
      const [movedGroup] = tabbyData.groups.splice(dragFromGroupIndex, 1);
      // Insert at new position (no adjustment needed - we already skipped dragged item when counting)
      tabbyData.groups.splice(toIndex, 0, movedGroup);
      renderGroups();
      updateSaveButton();
    } else if (dragType === "link" && placeholder && placeholder.parentNode) {
      const linksContainer = placeholder.closest(".links-container");
      if (linksContainer) {
        const toGroupIndex = parseInt(linksContainer.dataset.group);
        const movedLink =
          tabbyData.groups[dragFromGroupIndex].links[dragFromLinkIndex];

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
        tabbyData.groups[dragFromGroupIndex].links.splice(dragFromLinkIndex, 1);

        // Insert at new position (no adjustment needed - we already skipped dragged item when counting)
        tabbyData.groups[toGroupIndex].links.splice(toLinkIndex, 0, movedLink);
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
