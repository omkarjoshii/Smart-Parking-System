# ADCET Smart Parking - Website (v2.0)

Red and white theme on every page, ADCET logo in images/adcet-logo.png (header, login, PDF and printed reports).

## Admin panel - 7 analytics pages (side menu on every admin page)
1. Analytics Overview (analytics-overview.html) - HIGHEST PRIORITY: total parking slots, occupied and available slots, total bookings, confirmed and cancelled bookings, parking occupancy %, booking trends
2. Parking Analytics (parking-analytics.html) - daily/weekly/monthly usage, most-used slots, peak hours, average duration, occupancy % graph
3. Live Monitoring (live-monitoring.html) - ESP32 status, live sensor readings, entrance/exit sensor, automatic gate, last updated time
4. Booking Reports (booking-reports.html) - all records, booking ID, vehicle number, date and duration, confirmed / pending / cancelled, search and filters
5. Revenue Analytics (revenue.html) - daily/monthly booking amount, total confirmed value, payment status, comparison charts
6. Reports & Downloads (reports-downloads.html) - daily/weekly/monthly report, Download PDF, Export Excel, Print
7. System Settings (settings.html) - slot configuration, parking charges, admin profile, ESP32 info, system information
(admin.html is the operations dashboard: QR scanner & slot verification, live bays, arrivals, check-out, cancel.)

## QR Code Slot Reservation & Gate Verification (v2.1)
- **Digital QR Pass on Receipt (`receipt.html`)**: Automatically generates a high-contrast digital QR pass containing booking ID, user details, vehicle registration, and assigned slot number. Includes a 1-click "Save QR Pass" feature to download the pass as an image for offline use.
- **Admin QR Scanner & Verification (`admin.html`)**: Real-time scanner with 3 verification modes:
  1. **Camera Scanner**: Live camera viewfinder with laser sweep targeting and instant QR decoding using `jsQR`.
  2. **Image Upload**: Drag-and-drop or upload a screenshot/photo of the customer's QR pass.
  3. **Manual / Barcode Scanner Input**: Type or scan booking IDs with USB hardware barcode/QR scanners.
- **Live User Verification & Gate Control**:
  - Instantly highlights the user's allocated parking bay (`SLOT 1`, `SLOT 2`, etc.).
  - Verifies reservation validity and payment status (Paid vs Pay at exit).
  - **Check-In (Arrival)**: 1-click verification marks user as Active, records arrival timestamp, triggers automatic gate opening simulation, and updates live bays.
  - **Check-Out**: Calculates parked duration and final amount, collects any outstanding balance, marks slot freed, and triggers exit gate.
- **Cross-Device Sync**: Bookings are stored by the Node.js server and shared with the admin dashboard and booking pages on other devices using the same server.

Settings saved on the System Settings page (charge, closed slots, password, ESP32 address) are stored in the browser and override js/config.js.
PDF and Excel files are created inside the browser - no internet needed.


Pages:
- index.html - home, live slot status, find booking
- book.html - booking form (details, time, slot, payment)
- receipt.html - booking confirmation / receipt
- admin-login.html - admin login (defaults: User ID `Omkarjoshi8`, Password `adcet@123`; configurable with server environment variables)
- admin.html - admin dashboard (slots, sensors, bookings, collection)
- parking-analytics.html - NEW: daily/weekly/monthly usage, most-used slots, peak hours, average duration, occupancy % graph
- revenue.html - NEW: daily/monthly booking amount, total booking value, payment status, comparison charts

New files: js/charts.js (graphs), js/analytics.js (calculations), css/analytics.css.
Open the analytics pages from the buttons on the admin dashboard (admin login needed).
Graphs are empty until there are bookings: use "Load sample data" on the analytics pages for
the demo, and "Remove sample data" afterwards (sample bookings have IDs starting DEMO-).
Analytics are calculated from booking times, not from sensor history.

Defaults are in js/config.js (rate per hour = 20; the ESP32 address is set in System Settings, admin password). js/config.js, js/common.js and css/style.css were rebuilt in v2.0 - check the ESP32 JSON field names in fetchLive() in js/common.js against your handleData().

## STEP 1 - Small change in your ESP32 code (only once)

The website and the ESP32 are on different addresses, so the browser blocks the data
unless the ESP32 allows it. In your ESP32 code, find handleData() and add ONE line
just before `server.send(200, "application/json", json);` :

    server.sendHeader("Access-Control-Allow-Origin", "*");

So the end of handleData() looks like:

    json += "}";

    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", json);

Upload the code to the ESP32 again.

## STEP 2 - Requirements

Install Node.js and VS Code. No Live Server extension is required.

## STEP 3 - Open the project

1. Unzip smart-parking-web.zip.
2. VS Code -> File -> Open Folder -> choose the smart-parking-web folder.

## STEP 4 - Run it

1. Open the `smart-parking-web 1` folder in VS Code.
2. Run `node smart-parking-web/dev-server.js`. The server starts on port 8080 and serves the site and shared booking API.
3. On the host computer, open http://127.0.0.1:8080. For other devices on the same Wi-Fi, use `http://<host IPv4 address>:8080`.

Without the ESP32 it shows DEMO mode: on the admin page, click a slot to make it
occupied/free for testing. All booking features work in demo mode.

## STEP 5 - Connect with the real ESP32

1. Power the ESP32 (your code is uploaded).
2. On the laptop, connect Wi-Fi to:  ESP32-PARKING   password: 12345678
3. Admin > System Settings > ESP32 connection information: enter the ESP32 data address (http://<ESP32 IP>/data), click Save. Then refresh the website. The dot turns green and says "Live from the parking sensors".
   (Laptop will have no internet on this Wi-Fi - that is normal, the site still works.)

If the dot stays orange: first check that the ESP32 data address is saved in the admin page System Settings > ESP32 connection information, then open that address in the browser. If you see
data, check Step 1. If not, check the Wi-Fi connection.

## STEP 6 - Show it on a phone (for the demo)

1. Keep the laptop connected to ESP32-PARKING with `node smart-parking-web/dev-server.js` running.
2. Find the laptop IP: Windows -> open Command Prompt -> type `ipconfig`
   -> look at "IPv4 Address".
3. Connect the phone to Wi-Fi ESP32-PARKING.
4. On the phone browser open:  http://<laptop IPv4 address>:8080
   (If it does not open, allow "Visual Studio Code / Node" in Windows Firewall.)

## Deploying online (GitHub Pages / Netlify / Vercel)?

Not for the live sensor data. An https website is not allowed to read data from the
ESP32 (http), so the browser blocks it. Online hosting only works in demo mode. For
the project demo use Step 5 and 6. These static hosts also do not run the Node booking
API, so cross-device bookings and server-side slot locking require deploying the Node
server with persistent storage or connecting a shared database.

## Important notes (be honest in your viva)

- Bookings are saved in `~/.adcet-smart-parking/bookings.json` by the Node server.
  Keep that server running for shared bookings and slot locking. Back up this file
  regularly. Set `ADCET_ADMIN_USER` and `ADCET_ADMIN_PASS` before running the server
  if you need non-default admin credentials.
- This JSON-file backend is for a single Node server; use a shared database for
  multi-instance/cloud deployment. Payment is simulated.
- Slot status (free/occupied) is real: it comes from your IR sensors through the ESP32.
