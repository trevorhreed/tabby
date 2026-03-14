const MAX_IMAGE_INDEX = 64;
const MAX_CHRISTMAS_INDEX = 50;

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

async function loadData() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["tabbyData"], (result) => {
      const data = result.tabbyData || defaultData;
      // Handle old array format
      if (Array.isArray(data)) {
        resolve({
          settings: { showLinks: true, showClock: true },
          groups: data,
        });
      } else {
        resolve(data);
      }
    });
  });
}

const getSeason = () => {
  const month = new Date().getMonth() + 1;
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
  if (month === 12) return Math.random() < 0.2 ? "autumn" : "winter";
  return "winter";
};

const getBackgroundImage = () => {
  const randomIndex = Math.floor(Math.random() * MAX_IMAGE_INDEX) + 1;
  const randomCategory = getSeason();
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

const getFormattedTime = () => {
  const now = new Date();
  const dayOfTheWeek = daysOfTheWeek[now.getDay()];
  const month = months[now.getMonth()];
  const dayOfTheMonth = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const formattedHours = hours < 10 ? `0${hours}` : hours;
  const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
  const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
  return `${dayOfTheWeek} ${month} ${dayOfTheMonth} \u2022 ${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
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

function updateClock() {
  const clockSpan = document.querySelector("#clock span");
  if (clockSpan) {
    clockSpan.textContent = getFormattedTime();
  }
}

async function init() {
  const tabbyData = await loadData();

  // Settings link
  document.getElementById("settings-link").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Handle showLinks setting
  const linkGroupsSection = document.getElementById("link-groups");
  if (!tabbyData.settings.showLinks) {
    linkGroupsSection.style.display = "none";
  } else {
    renderGroups(tabbyData.groups);
  }

  // Handle showClock setting
  const clockSection = document.getElementById("clock");
  if (!tabbyData.settings.showClock) {
    clockSection.style.display = "none";
  } else {
    updateClock();
    setInterval(updateClock, 100);
  }

  // Set background image and colors
  const imageUrl = getBackgroundImage();
  setBackgroundImage(imageUrl);
  const color = await getColorsFromImage(imageUrl);
  setTextColor(color.light, "--text");
  setTextColor(color.dark + "dd", "--panel-background");
}

document.addEventListener("DOMContentLoaded", init);
