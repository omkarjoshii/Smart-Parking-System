// ADCET Smart Parking - settings.
// Defaults are below. Values changed on the "System Settings" page are saved in the
// browser (localStorage) and override these defaults.
const SETTINGS_KEY = "adcet_settings";

const CONFIG_DEFAULTS = {
  ESP32_URL: "",                          // set on the System Settings page (ESP32 data address)
  ESP32_SSID: "ESP32-PARKING",
  POLL_MS: 2000,                          // how often live data is refreshed
  TOTAL_SLOTS: 4,                         // fixed by the number of IR slot sensors
  RATE_PER_HOUR: 20,                      // parking charge in rupees
  DISABLED_SLOTS: [],                     // slot numbers closed for booking
  ADMIN_USER: "Omkarjoshi8",
  ADMIN_PASS: "adcet@123",
  ADMIN_NAME: "Admin",
  ADMIN_EMAIL: "",
  ADMIN_MOBILE: "",
  VERSION: "2.0"
};

function getSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
}
function saveSettings(patch) {
  const s = Object.assign(getSettings(), patch);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  Object.assign(CONFIG, s);
}
function resetSettings() {
  localStorage.removeItem(SETTINGS_KEY);
  Object.keys(CONFIG).forEach(k => delete CONFIG[k]);
  Object.assign(CONFIG, CONFIG_DEFAULTS);
}

const CONFIG = Object.assign({}, CONFIG_DEFAULTS, getSettings());
