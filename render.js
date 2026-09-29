// Wallpaper, tint, clock and link rendering shared by the new tab and the
// settings preview. Loaded after storage.js and before the page script.

const MAX_IMAGE_INDEX = 64;
const MAX_CHRISTMAS_INDEX = 50;
// The tint only needs the average color, and averaging a small scaled-down
// copy lands within a fraction of a shade of averaging every full-res pixel.
const COLOR_SAMPLE_SIZE = 64;

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

const SEASONS = ["spring", "summer", "autumn", "winter", "christmas"];

// Every photo getBackgroundImage can pick, for browsing in the settings preview
const allBackgroundImages = () =>
  SEASONS.flatMap((season) => {
    const maxIndex = season === "christmas" ? MAX_CHRISTMAS_INDEX : MAX_IMAGE_INDEX;
    return Array.from(
      { length: maxIndex },
      (_, i) => `images/${season}/img_${String(i + 1).padStart(2, "0")}.jpg`,
    );
  });

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

// Average color of the photo; applyLook turns it into the panel palette.
const averageImageColor = (imageUrl) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = COLOR_SAMPLE_SIZE;
      canvas.height = COLOR_SAMPLE_SIZE;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const color = { red: 0, green: 0, blue: 0 };
      for (let i = 0; i < data.length; i += 4) {
        color.red += data[i];
        color.green += data[i + 1];
        color.blue += data[i + 2];
      }

      const pixelCount = data.length / 4;
      resolve({
        red: Math.round(color.red / pixelCount),
        green: Math.round(color.green / pixelCount),
        blue: Math.round(color.blue / pixelCount),
      });
    };
    img.src = imageUrl;
  });
};

// Average colors generated at publish time (scripts/build-tints.sh), keyed by
// image path. Absent in an unpacked dev checkout, where every photo falls
// back to averaging at runtime.
const TINTS_URL = "tints.json";
let precomputedTints;
const loadPrecomputedTints = async () => {
  if (!precomputedTints) {
    precomputedTints = fetch(TINTS_URL)
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({}));
  }
  return precomputedTints;
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

const LONG_DATE = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});
// Layouts where the clock heads the links show it lock-screen style: the
// date on its own line above a large time
const STACKED_CLOCK_LAYOUTS = ["center"];

// The clock's date and time as separate strings; the stacked style gets the
// spelled-out date, the inline style the short one
const getClockParts = (settings, stacked) => {
  const now = new Date();
  const dayOfTheWeek = daysOfTheWeek[now.getDay()];
  const month = months[now.getMonth()];
  const dayOfTheMonth = now.getDate();
  let hours = now.getHours();
  let suffix = "";
  if (settings.twelveHourClock) {
    suffix = hours < 12 ? "AM" : "PM";
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
  return {
    date: stacked ? LONG_DATE.format(now) : `${dayOfTheWeek} ${month} ${dayOfTheMonth}`,
    time: `${formattedHours}:${formattedMinutes}${secondsPart}`,
    suffix,
  };
};

// Chrome's cached icon for a page, via the favicon permission. Sites never
// visited in this browser come back as a generic globe. Null outside the
// extension (e.g. the screenshot harness), where _favicon doesn't exist.
const FAVICON_SIZE_PX = 32;
function faviconUrl(pageUrl) {
  if (!chrome.runtime?.getURL) return null;
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", FAVICON_SIZE_PX);
  return url.href;
}

function renderLinkGroups(groups) {
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
      const icon = faviconUrl(link.url);
      if (icon) {
        const img = document.createElement("img");
        img.className = "favicon";
        img.src = icon;
        img.alt = "";
        a.appendChild(img);
      }
      a.append(link.label);
      linksDiv.appendChild(a);
    });

    groupDiv.appendChild(linksDiv);
    container.appendChild(groupDiv);
  });
}

function updateClock(settings) {
  const clockSpan = document.querySelector("#clock > span");
  if (!clockSpan) return;
  const stacked = STACKED_CLOCK_LAYOUTS.includes(settings.look.layout);
  const { date, time, suffix } = getClockParts(settings, stacked);
  const parts = [];
  if (settings.showDate) parts.push(`<span class="clock-date">${date}</span>`);
  if (settings.showTime) {
    const suffixPart = suffix ? `<span class="clock-suffix">${suffix}</span>` : "";
    parts.push(`<span class="clock-time">${time}${suffixPart}</span>`);
  }
  const html = parts.join("");
  // Runs every 100ms; only touch the DOM when the text actually changes
  if (clockSpan.innerHTML !== html) clockSpan.innerHTML = html;
}

// Both panels zoom off one multiplier so they stay in proportion
function applyScales(settings) {
  document.documentElement.style.setProperty("--panel-scale", settings.scale);
}

// Shows the photo with the panels styled to match; resolves to the photo's
// average color so callers can re-apply the look without re-averaging
async function showBackground(imageUrl, look) {
  const known = (await loadPrecomputedTints())[imageUrl];
  // Without a precomputed tint, show the photo while it's averaged; with
  // one, tint and photo land together so the panels never flash the
  // default colors
  if (!known) setBackgroundImage(imageUrl);
  const rgb = known ?? (await averageImageColor(imageUrl));
  applyLook(look, rgb);
  setBackgroundImage(imageUrl);
  return rgb;
}

// Look settings: how the panels sit over the photo. corners is in em, so it
// scales with the panel.
const LOOK_STYLES = ["auto", "dark", "light", "system"];
// How much room the panels give their content: link padding, space between
// link groups, and the clock's padding
const LOOK_DENSITIES = ["compact", "comfortable", "spacious"];
const LOOK_LAYOUTS = ["corners", "center"];
// Blur choices in px; the settings slider steps through these
const LOOK_BLURS = [0, 6, 12, 18, 24, 36, 48, 72];
// Corner radii in em, spaced so each looks clearly different on a big panel
const LOOK_CORNERS = [0, 0.75, 1.75];

// The entry in stops closest to value, for saved values from older versions
// that aren't on the current list
const nearestStop = (stops, value) =>
  stops.reduce((best, stop) => (Math.abs(stop - value) < Math.abs(best - value) ? stop : best));
// Each preset is a whole look (every look setting except size, which
// depends on the screen), so no two resemble each other: together they
// cover both layouts, attached and floating, every density and every
// style. Frosted matches the default look.
const LOOK_PRESETS = [
  {
    name: "Frosted",
    layout: "corners", attached: true, density: "comfortable",
    style: "auto", blur: 12, corners: 1.75,
  },
  {
    name: "Focus",
    layout: "center", attached: true, density: "spacious",
    style: "auto", blur: 18, corners: 1.75,
  },
  {
    name: "Clear",
    layout: "center", attached: true, density: "compact",
    style: "auto", blur: 6, corners: 0.75,
  },
  {
    name: "Slate",
    layout: "corners", attached: true, density: "compact",
    style: "dark", blur: 24, corners: 0,
  },
  {
    name: "Milk glass",
    layout: "corners", attached: false, density: "spacious",
    style: "light", blur: 24, corners: 1.75,
  },
];
// The look settings a preset sets, which is also what has to match for a
// look to count as that preset
const PRESET_KEYS = ["layout", "attached", "density", "style", "blur", "corners"];
// Relative luminance above this means the photo is bright enough that a
// light panel with dark text reads better than the usual dark panel
const LIGHT_PANEL_THRESHOLD = 0.45;
// How far the panel moves from the photo's average color: toward black for
// dark panels, toward white for light ones
const PANEL_TONE = { dark: -50, light: 60 };
const PANEL_ALPHA = "aa";

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

const toLinear = (value) => {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminanceOf = ({ red, green, blue }) =>
  0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);

// Light or dark panel for this photo under the given style
function resolveLookStyle(style, rgb) {
  if (style === "light" || style === "dark") return style;
  if (style === "system") return systemDark.matches ? "dark" : "light";
  return luminanceOf(rgb) > LIGHT_PANEL_THRESHOLD ? "light" : "dark";
}

// Panel and text colors (opaque hex) for a look over a photo, plus whether
// the panel came out light or dark
function lookColors(look, rgb) {
  const resolved = resolveLookStyle(look.style, rgb);
  const tone = PANEL_TONE[resolved];
  const amount = Math.abs(tone) / 100;
  const panel = tone >= 0 ? lightenColor(rgb, amount) : darkenColor(rgb, amount);
  const text = resolved === "light" ? darkenColor(rgb, 0.7) : lightenColor(rgb, 0.4);
  return { panel: rgbToHex(panel), text: rgbToHex(text), resolved };
}

function applyLayout(look) {
  document.body.dataset.layout = look.layout;
  document.body.dataset.density = look.density;
  // Corners attaches every panel, Center just the gear (see panels.css)
  document.body.toggleAttribute("data-attached", look.attached);
  // Copied to <html> for the view transition, whose pseudo-elements hang off
  // the root rather than body
  document.documentElement.dataset.layout = look.layout;
  document.documentElement.toggleAttribute("data-attached", look.attached);
}

function applyLook(look, rgb) {
  const colors = lookColors(look, rgb);
  const root = document.documentElement.style;
  root.setProperty("--panel-background", colors.panel + PANEL_ALPHA);
  root.setProperty("--text", colors.text);
  root.setProperty("--panel-blur", `${look.blur}px`);
  root.setProperty("--panel-radius", `${nearestStop(LOOK_CORNERS, look.corners)}em`);
}
