// Analytics helpers. Needs js/config.js and js/common.js (getBookings, saveBookings, CONFIG).
const AN = (function () {
  const DAY = 864e5, HR = 36e5;

  const valid = b => b.status !== "Cancelled" && b.status !== "No-show";
  // parked period: actual times when known, otherwise the booked window
  function span(b) {
    const s = new Date(b.actualArrival || b.arrival).getTime();
    const e = new Date(b.status === "Completed" && b.actualExit ? b.actualExit : b.exit).getTime();
    return e > s ? [s, e] : null;
  }
  const money = b => b.status === "Completed" ? (b.finalAmount || b.amount) : b.amount;
  const startDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const overlap = (s, e, a, b) => Math.max(0, Math.min(e, b) - Math.max(s, a));
  const dlabel = t => new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

  const days = n => { const t = startDay(Date.now()); return [...Array(n)].map((_, i) => t - (n - 1 - i) * DAY); };
  const weeks = n => { const end = startDay(Date.now()) + DAY; return [...Array(n)].map((_, i) => end - (n - i) * 7 * DAY); };
  const months = n => { const d = new Date(); return [...Array(n)].map((_, i) => {
    const a = new Date(d.getFullYear(), d.getMonth() - (n - 1 - i), 1), b = new Date(d.getFullYear(), d.getMonth() - (n - 2 - i), 1);
    return { from: a.getTime(), to: b.getTime(), label: a.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) };
  }); };

  function usageHours(list, from, to) {
    let ms = 0;
    list.forEach(b => { const p = span(b); if (p) ms += overlap(p[0], p[1], from, to); });
    return ms / HR;
  }

  // average number of occupied slots for each hour of the day over the last n days
  function hourly(list, n) {
    const end = startDay(Date.now()) + DAY, start = end - n * DAY, out = Array(24).fill(0);
    list.forEach(b => {
      const p = span(b); if (!p) return;
      let t = Math.max(p[0], start); const e = Math.min(p[1], end);
      while (t < e) {
        const d = new Date(t), h = d.getHours();
        const nxt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h + 1).getTime();
        out[h] += Math.min(nxt, e) - t; t = nxt;
      }
    });
    return out.map(ms => ms / HR / n);
  }

  // ---- sample data (ids start with DEMO-) so graphs can be shown without real bookings ----
  const hasSample = () => getBookings().some(b => String(b.id).startsWith("DEMO-"));
  function addSample() {
    if (hasSample()) return;
    const list = getBookings(), made = [], now = Date.now(), methods = ["UPI", "Card", "Pay at exit"];
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    for (let i = 0; i < 70; i++) {
      const slot = rnd(1, 4), hours = rnd(1, 4), d = startDay(now) - rnd(0, 29) * DAY;
      const h = [8, 9, 9, 10, 11, 12, 13, 14, 15, 16][rnd(0, 9)], s = d + h * HR, e = s + hours * HR;
      if (s > now) continue;
      if (made.some(m => m.slot === slot && s < new Date(m.exit) && e > new Date(m.arrival))) continue;
      const r = Math.random(), st = r < .82 ? "Completed" : r < .92 ? "Cancelled" : "No-show", m = methods[rnd(0, 2)];
      made.push({
        id: "DEMO-" + (1000 + i), name: "Demo User", mobile: "9000000000", address: "Demo", vehicle: "MH10AB" + (1000 + i),
        vtype: "Car", slot, bookedAt: new Date(s - rnd(1, 3) * HR).toISOString(), arrival: new Date(s).toISOString(),
        exit: new Date(e).toISOString(), hours, amount: hours * CONFIG.RATE_PER_HOUR, method: m,
        payStatus: st === "Completed" || m !== "Pay at exit" && st !== "Cancelled" ? "Paid" : "Pending", txn: "",
        status: st, actualArrival: st === "Completed" ? new Date(s).toISOString() : "",
        actualExit: st === "Completed" ? new Date(e).toISOString() : "", finalAmount: st === "Completed" ? hours * CONFIG.RATE_PER_HOUR : 0
      });
    }
    saveBookings(list.concat(made)).catch(() => {});
  }
  const removeSample = () => saveBookings(getBookings().filter(b => !String(b.id).startsWith("DEMO-"))).catch(() => {});

  function sampleButtons(box, redraw) {
    const el = document.getElementById(box);
    function paint() {
      el.innerHTML = hasSample()
        ? '<button class="btn secondary small" id="smp">Remove sample data</button>'
        : '<button class="btn secondary small" id="smp">Load sample data</button>';
      document.getElementById("smp").onclick = () => { hasSample() ? removeSample() : addSample(); paint(); redraw(); };
    }
    paint();
  }

  // booking groups used by Analytics Overview, Booking Reports and Reports
  const isCancelled = b => !valid(b);                       // Cancelled or No-show
  const isPending = b => valid(b) && b.payStatus !== "Paid"; // confirmed, payment still due (pay at exit)
  const groupOf = b => isCancelled(b) ? "Cancelled" : "Confirmed";

  return { isCancelled, isPending, groupOf, DAY, HR, valid, span, money, startDay, overlap, dlabel, days, weeks, months, usageHours, hourly, sampleButtons };
})();
