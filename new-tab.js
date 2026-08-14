const MAX_IMAGE_INDEX = 64;
const MAX_CHRISTMAS_INDEX = 50;

const getSeason = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  if (month === 1) return "winter";
  if (month === 2) return Math.random() < 0.8 ? "winter" : "spring";
  if (month === 3) return Math.random() < 0.2 ? "winter" : "spring";
  if (month === 4) return "spring";
  if (month === 5) return Math.random() < 0.8 ? "spring" : "summer";
  if (month === 6) return Math.random() < 0.2 ? "spring" : "summer";
  if (month === 7) return "summer";
  if (month === 8) return Math.random() < 0.8 ? "summer" : "autumn";
  if (month === 9) return Math.random() < 0.2 ? "summer" : "autumn";
  if (month === 10) return "autumn";
  if (month === 11) return Math.random() < 0.8 ? "autumn" : "winter";
  if (month === 12) {
    if (day >= 1 && day <= 25 && Math.random() < day * 0.04) return "christmas";
    return Math.random() < 0.2 ? "autumn" : "winter";
  }
  return "winter";
};

const getBackgroundImage = () => {
  const randomCategory = getSeason();
  const maxIndex = randomCategory === "christmas" ? MAX_CHRISTMAS_INDEX : MAX_IMAGE_INDEX;
  const randomIndex = Math.floor(Math.random() * maxIndex) + 1;
  return `images/${randomCategory}/img_${("" + randomIndex).padStart(2, "0")}.jpg`;
};

const setBackgroundImage = (imageUrl) => {
  document.documentElement.style.setProperty("--image", `url(${imageUrl})`);
};

const toHexPart = (value) => value.toString(16).padStart(2, "0");

const rgbToHex = ({ red, green, blue }) =>
  `#${toHexPart(red)}${toHexPart(green)}${toHexPart(blue)}`;

const lightenColor = ({ red, green, blue }, factor) => ({
  red: Math.min(255, Math.round(red + (255 - red) * factor)),
  green: Math.min(255, Math.round(green + (255 - green) * factor)),
  blue: Math.min(255, Math.round(blue + (255 - blue) * factor)),
});

const darkenColor = ({ red, green, blue }, factor) => ({
  red: Math.max(0, Math.round(red * (1 - factor))),
  green: Math.max(0, Math.round(green * (1 - factor))),
  blue: Math.max(0, Math.round(blue * (1 - factor))),
});

const getColorsFromImage = async (imageUrl) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const color = { red: 0, green: 0, blue: 0 };
      for (let i = 0; i < data.length; i += 4) {
        color.red += data[i];
        color.green += data[i + 1];
        color.blue += data[i + 2];
      }

      const pixelCount = data.length / 4;
      const rgb = {
        red: Math.round(color.red / pixelCount),
        green: Math.round(color.green / pixelCount),
        blue: Math.round(color.blue / pixelCount),
      };

      resolve({
        light: rgbToHex(lightenColor(rgb, 0.4)),
        dark: rgbToHex(darkenColor(rgb, 0.6)),
      });
    };
    img.src = imageUrl;
  });
};

const setTextColor = (color, property) => {
  document.documentElement.style.setProperty(property, color);
};

const daysOfTheWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const getFormattedTime = (settings) => {
  const now = new Date();
  const dayOfTheWeek = daysOfTheWeek[now.getDay()];
  const month = months[now.getMonth()];
  const dayOfTheMonth = now.getDate();
  let hours = now.getHours();
  let suffix = "";
  if (settings.twelveHourClock) {
    suffix = hours < 12 ? " AM" : " PM";
    hours = hours % 12 || 12;
  }
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  // 12-hour times are conventionally unpadded
  const formattedHours =
    hours < 10 && !settings.twelveHourClock ? `0${hours}` : hours;
  const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
  const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
  const secondsPart = settings.showSeconds ? `:${formattedSeconds}` : "";
  return `${dayOfTheWeek} ${month} ${dayOfTheMonth} \u2022 ${formattedHours}:${formattedMinutes}${secondsPart}${suffix}`;
};

function renderGroups(groups) {
  const container = document.getElementById("link-groups");
  container.innerHTML = "";

  const visibleGroups = groups
    .filter((group) => !group.hide)
    .map((group) => ({
      ...group,
      links: group.links.filter((link) => !link.hide),
    }))
    .filter((group) => group.links.length > 0);

  visibleGroups.forEach((group) => {
    const groupDiv = document.createElement("div");
    groupDiv.className = "group";

    const label = document.createElement("label");
    label.textContent = group.label;
    groupDiv.appendChild(label);

    const linksDiv = document.createElement("div");
    linksDiv.className = "links";

    group.links.forEach((link) => {
      const a = document.createElement("a");
      a.className = "link";
      a.href = link.url;
      a.textContent = link.label;
      linksDiv.appendChild(a);
    });

    groupDiv.appendChild(linksDiv);
    container.appendChild(groupDiv);
  });
}

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
        renderGroups(await loadSetGroups(name));
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

function updateClock(settings) {
  const clockSpan = document.querySelector("#clock span");
  if (clockSpan) {
    clockSpan.textContent = getFormattedTime(settings);
  }
}

async function init() {
  const meta = await loadMeta();

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
    renderGroups(await loadSetGroups(activeSetName));
    initSetSwitcher(meta.setNames, activeSetName);
  }

  // Handle showClock setting
  const clockSection = document.getElementById("clock");
  if (!meta.settings.showClock) {
    clockSection.style.display = "none";
  } else {
    updateClock(meta.settings);
    setInterval(() => updateClock(meta.settings), 100);
  }

  // Set background image and colors
  const imageUrl = getBackgroundImage();
  setBackgroundImage(imageUrl);
  const color = await getColorsFromImage(imageUrl);
  setTextColor(color.light, "--text");
  setTextColor(color.dark + "dd", "--panel-background");
}

document.addEventListener("DOMContentLoaded", init);
