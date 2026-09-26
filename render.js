// Wallpaper, tint, clock and link rendering shared by the new tab and the
// settings preview. Loaded after storage.js and before the page script.

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

// Average color of every pixel in the photo; applyLook turns it into the
// panel palette.
const averageImageColor = (imageUrl) => {
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
  const datePart = `${dayOfTheWeek} ${month} ${dayOfTheMonth}`;
  const timePart = `${formattedHours}:${formattedMinutes}${secondsPart}${suffix}`;
  if (settings.showDate && settings.showTime) {
    return `${datePart} \u2022 ${timePart}`;
  }
  return settings.showDate ? datePart : timePart;
};

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
      a.textContent = link.label;
      linksDiv.appendChild(a);
    });

    groupDiv.appendChild(linksDiv);
    container.appendChild(groupDiv);
  });
}

function updateClock(settings) {
  const clockSpan = document.querySelector("#clock span");
  if (clockSpan) {
    clockSpan.textContent = getFormattedTime(settings);
  }
}

// Each panel zooms independently off its own multiplier
function applyScales(settings) {
  document.documentElement.style.setProperty("--links-scale", settings.linksScale);
  document.documentElement.style.setProperty("--clock-scale", settings.clockScale);
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

// Look settings: how the panels sit over the photo. tone runs from -90
// (toward black) through 0 (the photo's average) to +90 (toward white);
// null means the style's default, which keeps Auto and System readable on
// both bright and dark photos. corners is in em, so it scales with the panel.
const LOOK_STYLES = ["auto", "dark", "light", "system"];
const LOOK_EDGES = ["none", "line", "rim", "rim-line"];
const LOOK_LAYOUTS = ["corners", "center", "dock", "sidebar"];
const LOOK_PRESETS = [
  { name: "Clear glass", style: "auto", blur: 6, edge: "line", tone: null, corners: 0.75 },
  { name: "Frosted", style: "auto", blur: 12, edge: "rim-line", tone: null, corners: 1 },
  { name: "Heavy frost", style: "auto", blur: 24, edge: "rim", tone: null, corners: 1 },
  { name: "Smoked", style: "dark", blur: 12, edge: "none", tone: -65, corners: 0.75 },
  { name: "Tinted", style: "dark", blur: 18, edge: "rim-line", tone: -30, corners: 1.5 },
  { name: "Milk glass", style: "light", blur: 18, edge: "line", tone: 70, corners: 1 },
  { name: "Square", style: "auto", blur: 6, edge: "none", tone: null, corners: 0 },
  { name: "Pill", style: "auto", blur: 12, edge: "line", tone: null, corners: 2 },
  { name: "Follow system", style: "system", blur: 12, edge: "rim-line", tone: null, corners: 1 },
];
// Relative luminance above this means the photo is bright enough that a
// light panel with dark text reads better than the usual dark panel
const LIGHT_PANEL_THRESHOLD = 0.45;
const DEFAULT_TONE = { dark: -50, light: 60 };
const PANEL_ALPHA = "aa";
const LINE_STRENGTH = "45%";
const RIM_WIDTH_PX = 8;
// The rim's blur stacks on the panel's; with no panel blur it needs its own
const MIN_RIM_BLUR_PX = 12;

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

function applyLook(look, rgb) {
  const resolved = resolveLookStyle(look.style, rgb);
  const tone = look.tone ?? DEFAULT_TONE[resolved];
  const amount = Math.abs(tone) / 100;
  const panel = tone >= 0 ? lightenColor(rgb, amount) : darkenColor(rgb, amount);
  const text = resolved === "light" ? darkenColor(rgb, 0.7) : lightenColor(rgb, 0.4);
  const root = document.documentElement.style;
  root.setProperty("--panel-background", rgbToHex(panel) + PANEL_ALPHA);
  root.setProperty("--text", rgbToHex(text));
  root.setProperty("--panel-blur", `${look.blur}px`);
  root.setProperty("--panel-radius", `${look.corners}em`);
  root.setProperty(
    "--panel-line",
    look.edge.endsWith("line")
      ? `inset 0 0 0 1.5px color-mix(in srgb, var(--text) ${LINE_STRENGTH}, transparent)`
      : "none",
  );
  document.body.dataset.layout = look.layout;
  setRims(look.edge.startsWith("rim") ? Math.max(MIN_RIM_BLUR_PX, look.blur * 2) : 0);
}

// Builds an SVG path for a rectangle with per-corner radii
function roundedRectPath(x, y, w, h, [tl, tr, br, bl]) {
  return (
    `M${x + tl},${y} H${x + w - tr} A${tr},${tr} 0 0 1 ${x + w},${y + tr} ` +
    `V${y + h - br} A${br},${br} 0 0 1 ${x + w - br},${y + h} ` +
    `H${x + bl} A${bl},${bl} 0 0 1 ${x},${y + h - bl} V${y + tl} A${tl},${tl} 0 0 1 ${x + tl},${y} Z`
  );
}

// A mask would stop backdrop-filter from blurring, so each rim is a separate
// fixed element cut to a ring with an evenodd clip-path, tracking its panel's
// box and corner radii. Panels themselves can't hold the rim: an element with
// backdrop-filter hides the photo from its children's backdrop.
const rims = new Map();
let rimBlurPx = 0;

function placeRim(panel, rim) {
  const box = panel.getBoundingClientRect();
  const style = getComputedStyle(panel);
  const visible = rimBlurPx > 0 && box.width > 0 && style.display !== "none";
  rim.style.display = visible ? "block" : "none";
  if (!visible) return;
  // Radii are in the panel's zoomed coordinates; the box is in the page's
  const zoom = box.width / panel.offsetWidth || 1;
  const radii = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ].map((r) => Math.min(parseFloat(r) * zoom, box.width / 2, box.height / 2));
  const inner = radii.map((r) => Math.max(0, r - RIM_WIDTH_PX));
  const w = RIM_WIDTH_PX;
  Object.assign(rim.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    background: `color-mix(in srgb, ${style.backgroundColor} 40%, transparent)`,
    backdropFilter: `blur(${rimBlurPx}px)`,
    clipPath: `path(evenodd, "${roundedRectPath(0, 0, box.width, box.height, radii)} ${roundedRectPath(w, w, box.width - 2 * w, box.height - 2 * w, inner)}")`,
  });
}

const placeAllRims = () => rims.forEach((rim, panel) => placeRim(panel, rim));
const rimObserver = new ResizeObserver(placeAllRims);

function setRims(blurPx) {
  rimBlurPx = blurPx;
  document.querySelectorAll(".panel").forEach((panel) => {
    if (rims.has(panel) || panel.closest(".set-switcher-menu")) return;
    const rim = document.createElement("div");
    rim.className = "panel-rim";
    document.body.appendChild(rim);
    rims.set(panel, rim);
    rimObserver.observe(panel);
  });
  // Layout changes move panels without resizing them, so re-place next frame
  requestAnimationFrame(placeAllRims);
}
window.addEventListener("resize", placeAllRims);
