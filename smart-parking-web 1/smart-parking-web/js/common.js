// Shared helpers for every page. Needs js/config.js loaded first.
const LAST_USER_KEY = "adcet_last_user";
const BOOKINGS_KEY = "adcet_bookings";
const DEMO_KEY = "adcet_demo_slots";
const SEEN_KEY = "adcet_esp_last_seen";

// ---------- small utilities ----------
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function rupees(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }

function fmtDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return "-";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDuration(a, b) {
  const m = Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
  const h = Math.floor(m / 60), r = m % 60;
  return h ? h + " h" + (r ? " " + r + " min" : "") : r + " min";
}
function toLocalInput(d) {
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}
// billed hours: rounded up, minimum 1 hour
function hoursBetween(a, b) {
  return Math.max(1, Math.ceil((new Date(b) - new Date(a)) / 36e5 - 1e-9));
}
function calcAmount(a, b) { return hoursBetween(a, b) * CONFIG.RATE_PER_HOUR; }

function normaliseVehicle(v) { return String(v || "").toUpperCase().replace(/[\s-]/g, ""); }
function validVehicle(v) { return /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/.test(v); }

// ---------- bookings (shared by the website server) ----------
function getBookings() {
  try { const l = JSON.parse(localStorage.getItem(BOOKINGS_KEY)); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
function storeBookings(list) { localStorage.setItem(BOOKINGS_KEY, JSON.stringify(list)); }
function getAdminToken() { return sessionStorage.getItem("adcet_admin_token") || ""; }
let sharedReservations = [];
let bookingSyncWarning = false;

async function bookingApi(path, options) {
  const response = await fetch(path, Object.assign({ cache: "no-store" }, options || {}));
  let result;
  try { result = await response.json(); } catch (e) { result = {}; }
  if (!response.ok) throw new Error(result.error || "Booking service returned HTTP " + response.status);
  return result;
}

function adminApiOptions(method, body) {
  const headers = { Authorization: "Bearer " + getAdminToken() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };
}

function reportBookingSyncError(error) {
  if (error && error.message === "Admin login required.") {
    sessionStorage.removeItem("adcet_admin");
    sessionStorage.removeItem("adcet_admin_token");
    location.href = "admin-login.html";
    return;
  }
  if (!bookingSyncWarning) {
    toast("Booking server error: " + ((error && error.message) || error));
    bookingSyncWarning = true;
  }
}

function saveBookings(list) {
  storeBookings(list);
  return bookingApi("/api/bookings", adminApiOptions("PUT", list))
    .then(() => { bookingSyncWarning = false; })
    .catch(error => { reportBookingSyncError(error); throw error; });
}

async function deleteBooking(id) {
  await bookingApi("/api/bookings/" + encodeURIComponent(id), adminApiOptions("DELETE"));
  storeBookings(getBookings().filter(b => b.id !== id));
}

async function clearBookings() {
  await bookingApi("/api/bookings", adminApiOptions("DELETE"));
  storeBookings([]);
}

function findBooking(id) { return getBookings().find(b => b.id === id); }
function updateBooking(id, patch) {
  const list = getBookings();
  const b = list.find(x => x.id === id);
  if (!b) return Promise.resolve(null);
  const isAdmin = Boolean(getAdminToken());
  if (!isAdmin && (patch.status !== "Cancelled" || Object.keys(patch).length !== 1)) {
    return Promise.reject(new Error("Admin login required to edit this booking."));
  }
  Object.assign(b, patch);
  storeBookings(list);
  const route = isAdmin
    ? "/api/bookings/" + encodeURIComponent(id)
    : "/api/bookings/" + encodeURIComponent(id) + "/cancel";
  return bookingApi(route, isAdmin
    ? adminApiOptions("PATCH", patch)
    : { method: "POST" })
    .then(updated => {
      const current = getBookings();
      const index = current.findIndex(x => x.id === id);
      if (index >= 0) { current[index] = updated; storeBookings(current); }
      bookingSyncWarning = false;
      return updated;
    })
    .catch(error => { reportBookingSyncError(error); throw error; });
}

async function createBooking(booking) {
  const saved = await bookingApi("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(booking)
  });
  const list = getBookings().filter(b => b.id !== saved.id);
  list.push(saved);
  storeBookings(list);
  sharedReservations = sharedReservations.filter(b => b.id !== saved.id);
  bookingSyncWarning = false;
  return saved;
}

async function fetchBooking(id) {
  const booking = await bookingApi("/api/bookings/" + encodeURIComponent(id));
  const list = getBookings().filter(b => b.id !== booking.id);
  list.push(booking);
  storeBookings(list);
  return booking;
}

async function refreshSharedReservations() {
  sharedReservations = await bookingApi("/api/availability");
  return sharedReservations;
}

async function syncAdminBookings() {
  const bookings = await bookingApi("/api/bookings", adminApiOptions("GET"));
  storeBookings(bookings);
  bookingSyncWarning = false;
  return bookings;
}

function watchAdminBookings(render, interval) {
  let running = false;
  const sync = async () => {
    if (running) return;
    running = true;
    try {
      await syncAdminBookings();
      render();
    } catch (error) {
      reportBookingSyncError(error);
    } finally {
      running = false;
    }
  };
  sync();
  return setInterval(sync, interval || CONFIG.POLL_MS);
}

// ---------- QR Code payload helpers ----------
function makeBookingQRPayload(b) {
  return JSON.stringify({
    app: "ADCET_PARK",
    id: b.id,
    name: b.name,
    mobile: b.mobile,
    vehicle: b.vehicle,
    vtype: b.vtype || "4-Wheeler Car",
    slot: Number(b.slot),
    arrival: b.arrival,
    exit: b.exit,
    amount: b.amount,
    payStatus: b.payStatus,
    status: b.status,
    bookedAt: b.bookedAt
  });
}

function parseBookingQRData(str) {
  if (!str) return null;
  const s = String(str).trim();

  // 1. JSON payload
  try {
    const j = JSON.parse(s);
    if (j && (j.id || j.app === "ADCET_PARK")) return j;
  } catch (e) {}

  // 2. URL containing id or verify
  if (s.includes("id=") || s.includes("verify=")) {
    try {
      const u = new URL(s.startsWith("http") ? s : "http://dummy/" + s);
      const id = u.searchParams.get("id") || u.searchParams.get("verify");
      if (id) {
        const found = findBooking(id);
        return found || { id: id };
      }
    } catch (e) {}
  }

  // 3. String booking ID
  const m = s.match(/(ADC[A-Z0-9-]+)/i);
  if (m) {
    const id = m[1].toUpperCase();
    const found = findBooking(id);
    return found || { id: id };
  }

  return null;
}

function importBookingFromQR(data) {
  if (!data || !data.id) return null;
  const existing = findBooking(data.id);
  if (existing) {
    // Optionally update fields if changed
    return existing;
  }
  const b = {
    id: data.id,
    name: data.name || "Customer",
    mobile: data.mobile || "-",
    address: data.address || data.addr || "-",
    vehicle: data.vehicle || data.veh || "-",
    vtype: data.vtype || "4-Wheeler Car",
    slot: Number(data.slot || 1),
    arrival: data.arrival || data.arr || new Date().toISOString(),
    exit: data.exit || new Date(Date.now() + 3600000).toISOString(),
    method: data.method || "Cash/UPI",
    payStatus: data.payStatus || data.pay || "Pending",
    amount: Number(data.amount || data.amt || CONFIG.RATE_PER_HOUR),
    status: data.status || data.st || "Booked",
    bookedAt: data.bookedAt || data.ts || new Date().toISOString()
  };
  const list = getBookings();
  list.unshift(b);
  saveBookings(list).catch(() => {});
  return b;
}

function playBeep(type) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "error") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(140, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.18);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.14);
    }
  } catch (e) {}
}
function newBookingId() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  const day = String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate());
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const id = "ADC" + day + "-" + suffix;
  return id;
}
const isLive = b => b.status === "Booked" || b.status === "Active";

function slotEnabled(n) { return !(CONFIG.DISABLED_SLOTS || []).includes(Number(n)); }

function slotIsFreeForWindow(slot, a, e) {
  if (!slotEnabled(slot)) return false;
  const A = new Date(a), E = new Date(e);
  const bookings = getBookings().concat(sharedReservations);
  return !bookings.some(b => isLive(b) && Number(b.slot) === Number(slot) &&
    A < new Date(b.exit) && E > new Date(b.arrival));
}

// ---------- live data from the ESP32 (or demo data) ----------
const truthy = v => v === true || v === 1 || /^(1|true|open|opened|occupied|detected|on|full)$/i.test(String(v));
const firstOf = (o, keys) => { for (const k of keys) if (o[k] !== undefined) return o[k]; return undefined; };

function demoSlots() {
  try { const s = JSON.parse(localStorage.getItem(DEMO_KEY)); if (Array.isArray(s) && s.length === CONFIG.TOTAL_SLOTS) return s; } catch (e) {}
  return [false, true, false, false].slice(0, CONFIG.TOTAL_SLOTS);
}
function toggleDemoSlot(n) {
  const s = demoSlots();
  s[n - 1] = !s[n - 1];
  localStorage.setItem(DEMO_KEY, JSON.stringify(s));
}

async function fetchLive() {
  const t0 = Date.now();
  try {
    if (!CONFIG.ESP32_URL) throw new Error("ESP32 address not set (System Settings)");
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(CONFIG.ESP32_URL, { cache: "no-store", signal: ctl.signal });
    clearTimeout(to);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const n = CONFIG.TOTAL_SLOTS;
    const slots = Array.isArray(j.slots)
      ? j.slots.slice(0, n).map(truthy)
      : [...Array(n)].map((_, i) => truthy(firstOf(j, ["s" + (i + 1), "slot" + (i + 1), "slot_" + (i + 1), "ir" + (i + 1), "IR" + (i + 1)])));
    const seen = new Date();
    try { localStorage.setItem(SEEN_KEY, seen.toISOString()); } catch (e) {}
    return {
      online: true, demo: false, slots, raw: j, at: seen, ms: Date.now() - t0,
      entrance: truthy(firstOf(j, ["entrance", "entry", "ir5", "IR5"])),
      exit: truthy(firstOf(j, ["exit", "ir6", "IR6"])),
      gate: truthy(firstOf(j, ["gate", "gateOpen", "gate_open"]))
    };
  } catch (e) {
    return {
      online: false, demo: true, slots: demoSlots(), raw: null, at: new Date(), ms: null,
      error: String((e && e.message) || e), entrance: false, exit: false, gate: false
    };
  }
}

function freeCount(live) {
  return live.slots.filter((occ, i) => !occ && slotEnabled(i + 1)).length;
}

function renderBays(id, live, clickable) {
  const el = document.getElementById(id);
  el.classList.add("bays");
  el.innerHTML = live.slots.map((occ, i) => {
    const off = !slotEnabled(i + 1);
    const cls = off ? "off" : occ ? "occ" : "free";
    return '<div class="bay ' + cls + (clickable ? " click" : "") + '" data-slot="' + (i + 1) + '">' +
      '<div class="n">Slot ' + (i + 1) + '</div><div class="s">' + (off ? "CLOSED" : occ ? "OCCUPIED" : "FREE") + "</div></div>";
  }).join("");
}

// ---------- page chrome ----------
function renderHeader(active) {
  const nav = [["home", "index.html", "Home"], ["book", "book.html", "Book a Slot"],
               ["find", "index.html#find", "Find my booking"], ["admin", "admin.html", "Admin"]];
  document.getElementById("site-header").innerHTML =
    '<header class="topbar"><div class="topbar-in">' +
    '<a class="brand" href="index.html"><span class="logo-badge"><img src="images/adcet-logo.png" alt="ADCET"></span>' +
    "<span><b>ADCET Smart Parking</b><small>Annasaheb Dange College of Engineering &amp; Technology, Ashta</small></span></a>" +
    "<nav>" + nav.map(n => '<a href="' + n[1] + '"' + (n[0] === active ? ' class="on"' : "") + ">" + n[2] + "</a>").join("") + "</nav>" +
    "</div></header>";
}

function renderFooter() {
  document.getElementById("site-footer").innerHTML =
    '<footer class="footer"><div class="footer-in"><b>ADCET Smart Parking</b> &middot; Annasaheb Dange College of Engineering &amp; Technology, Ashta, Dist. Sangli' +
    "<br><span>&copy; " + new Date().getFullYear() + " ADCET Smart Parking &middot; <b>All Rights Reserved by Omkar Joshi</b></span></div></footer>";
}

// Admin side menu = the 7 analytics pages + the operations dashboard + QR scanner
const ADMIN_MENU = [
  ["dashboard", "admin.html", "Admin Dashboard", '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'],
  ["scanner", "admin.html?scan=1", "Scan QR &amp; Gate", '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 12h4M12 10v4"/>'],
  ["overview", "analytics-overview.html", "Analytics Overview", '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'],
  ["parking", "parking-analytics.html", "Parking Analytics", '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
  ["live", "live-monitoring.html", "Live Monitoring", '<path d="M2 12h4l3-8 4 16 3-8h6"/>'],
  ["bookings", "booking-reports.html", "Booking Reports", '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>'],
  ["revenue", "revenue.html", "Revenue Analytics", '<path d="M7 5h10M7 9h10M7 5c6 0 6 8 0 8l7 7"/>'],
  ["reports", "reports-downloads.html", "Reports &amp; Downloads", '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>'],
  ["settings", "settings.html", "System Settings", '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>']
];

function renderSidebar(active) {
  const main = document.querySelector(".wrap");
  const layout = document.createElement("div");
  layout.className = "admin-layout";
  const aside = document.createElement("aside");
  aside.className = "sidebar";
  aside.innerHTML = '<div class="sb-title">Admin panel</div>' +
    ADMIN_MENU.map(m => '<a href="' + m[1] + '"' + (m[0] === active ? ' class="on"' : "") + '>' +
      '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + m[3] + "</svg>" +
      "<span>" + m[2] + "</span></a>").join("") +
    '<a href="#" id="sb-logout" class="sb-out"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/></svg><span>Logout</span></a>';
  main.parentNode.insertBefore(layout, main);
  layout.appendChild(aside);
  main.classList.add("admin-main");
  layout.appendChild(main);
  document.getElementById("sb-logout").addEventListener("click", e => {
    e.preventDefault();
    sessionStorage.removeItem("adcet_admin");
    sessionStorage.removeItem("adcet_admin_token");
    location.href = "admin-login.html";
  });
}

function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = "show";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = ""; }, 2600);
}
