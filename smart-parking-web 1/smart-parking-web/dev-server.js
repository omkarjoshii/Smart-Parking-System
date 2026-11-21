const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const root = path.resolve(__dirname);
const dataDirectory = path.resolve(process.env.ADCET_DATA_DIR || path.join(os.homedir(), ".adcet-smart-parking"));
const bookingsFile = path.join(dataDirectory, "bookings.json");
const totalSlots = Number(process.env.ADCET_TOTAL_SLOTS) || 4;
const adminUser = process.env.ADCET_ADMIN_USER || "Omkarjoshi8";
const adminPassword = process.env.ADCET_ADMIN_PASS || "adcet@123";
const adminSessions = new Map();
let writeQueue = Promise.resolve();
const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
};

function sendJson(response, status, value) {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    response.end(JSON.stringify(value));
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", chunk => {
            body += chunk;
            if (body.length > 1024 * 1024) {
                reject(new Error("Request body is too large"));
                request.destroy();
            }
        });
        request.on("end", () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch { reject(new Error("Invalid JSON request")); }
        });
        request.on("error", reject);
    });
}

async function readBookings() {
    try {
        const contents = await fs.promises.readFile(bookingsFile, "utf8");
        const bookings = JSON.parse(contents);
        if (!Array.isArray(bookings)) throw new Error("Booking data must be an array");
        return bookings;
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
}

async function writeBookings(bookings) {
    await fs.promises.mkdir(dataDirectory, { recursive: true });
    const temporaryFile = bookingsFile + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
    await fs.promises.writeFile(temporaryFile, JSON.stringify(bookings), { mode: 0o600 });
    await fs.promises.rename(temporaryFile, bookingsFile);
}

function serializeWrite(operation) {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.catch(() => {});
    return result;
}

function requireAdmin(request, response) {
    const match = String(request.headers.authorization || "").match(/^Bearer (.+)$/i);
    const expiresAt = match && adminSessions.get(match[1]);
    if (!expiresAt || expiresAt <= Date.now()) {
        if (match) adminSessions.delete(match[1]);
        sendJson(response, 401, { error: "Admin login required." });
        return false;
    }
    return true;
}

function overlaps(a, b) {
    return Number(a.slot) === Number(b.slot) &&
        new Date(a.arrival) < new Date(b.exit) &&
        new Date(a.exit) > new Date(b.arrival);
}

function validNewBooking(booking) {
    const arrival = new Date(booking && booking.arrival);
    const exit = new Date(booking && booking.exit);
    return booking && typeof booking.id === "string" &&
        Number.isInteger(Number(booking.slot)) &&
        Number(booking.slot) >= 1 && Number(booking.slot) <= totalSlots &&
        Number.isFinite(arrival.getTime()) && Number.isFinite(exit.getTime()) &&
        exit > arrival && exit - arrival <= 24 * 60 * 60 * 1000 &&
        typeof booking.name === "string" && booking.name.trim().length >= 3 &&
        typeof booking.vehicle === "string" && booking.vehicle.length > 0;
}

async function handleApi(request, response, url) {
    const pathname = url.pathname;
    if (pathname === "/api/session" && request.method === "POST") {
        const credentials = await readBody(request);
        if (credentials.user !== adminUser || credentials.password !== adminPassword) {
            sendJson(response, 401, { error: "Wrong user ID or password." });
            return;
        }
        const token = crypto.randomBytes(32).toString("hex");
        adminSessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
        sendJson(response, 200, { token });
        return;
    }

    if (pathname === "/api/availability" && request.method === "GET") {
        const bookings = await readBookings();
        sendJson(response, 200, bookings
            .filter(b => b.status === "Booked" || b.status === "Active")
            .map(({ slot, arrival, exit, status }) => ({ slot, arrival, exit, status })));
        return;
    }

    if (pathname === "/api/bookings" && request.method === "GET") {
        if (!requireAdmin(request, response)) return;
        sendJson(response, 200, await readBookings());
        return;
    }

    if (pathname === "/api/bookings" && request.method === "POST") {
        const booking = await readBody(request);
        if (!validNewBooking(booking) || booking.status !== "Booked") {
            sendJson(response, 400, { error: "Booking details are invalid." });
            return;
        }
        const created = await serializeWrite(async () => {
            const bookings = await readBookings();
            if (bookings.some(b => b.id === booking.id)) {
                const error = new Error("This booking ID already exists.");
                error.status = 409;
                throw error;
            }
            const conflict = bookings.some(b =>
                (b.status === "Booked" || b.status === "Active") && overlaps(b, booking));
            if (conflict) {
                const error = new Error("Sorry, this slot was just booked. Please choose another slot or time.");
                error.status = 409;
                throw error;
            }
            bookings.push(booking);
            await writeBookings(bookings);
            return booking;
        });
        sendJson(response, 201, created);
        return;
    }

    if (pathname === "/api/bookings" && request.method === "PUT") {
        if (!requireAdmin(request, response)) return;
        const bookings = await readBody(request);
        if (!Array.isArray(bookings) || bookings.length > 10000) {
            sendJson(response, 400, { error: "Booking list is invalid." });
            return;
        }
        await serializeWrite(() => writeBookings(bookings));
        sendJson(response, 200, { saved: bookings.length });
        return;
    }

    const bookingRoute = pathname.match(/^\/api\/bookings\/([^/]+)(?:\/(cancel))?$/);
    if (bookingRoute) {
        const id = decodeURIComponent(bookingRoute[1]);
        if (bookingRoute[2] === "cancel" && request.method === "POST") {
            const updated = await serializeWrite(async () => {
                const bookings = await readBookings();
                const booking = bookings.find(b => b.id === id);
                if (!booking || booking.status !== "Booked") return null;
                booking.status = "Cancelled";
                await writeBookings(bookings);
                return booking;
            });
            if (!updated) {
                sendJson(response, 404, { error: "Active booking not found." });
                return;
            }
            sendJson(response, 200, updated);
            return;
        }

        if (request.method === "GET") {
            const booking = (await readBookings()).find(b => b.id === id);
            sendJson(response, booking ? 200 : 404, booking || { error: "Booking not found." });
            return;
        }

        if (!requireAdmin(request, response)) return;
        if (request.method === "PATCH") {
            const patch = await readBody(request);
            const allowedFields = new Set([
                "name", "mobile", "address", "vehicle", "vtype", "slot", "arrival", "exit",
                "hours", "amount", "method", "payStatus", "txn", "status", "actualArrival",
                "actualExit", "finalAmount"
            ]);
            if (!patch || typeof patch !== "object" || Array.isArray(patch) ||
                Object.keys(patch).some(key => !allowedFields.has(key)) ||
                (patch.status && !["Booked", "Active", "Completed", "Cancelled", "No-show"].includes(patch.status))) {
                sendJson(response, 400, { error: "Booking update is invalid." });
                return;
            }
            const updated = await serializeWrite(async () => {
                const bookings = await readBookings();
                const booking = bookings.find(b => b.id === id);
                if (!booking) return null;
                const candidate = Object.assign({}, booking, patch);
                if ((candidate.status === "Booked" || candidate.status === "Active") &&
                    bookings.some(other => other.id !== id &&
                        (other.status === "Booked" || other.status === "Active") && overlaps(other, candidate))) {
                    const error = new Error("This slot and time overlap another active booking.");
                    error.status = 409;
                    throw error;
                }
                Object.assign(booking, patch);
                await writeBookings(bookings);
                return booking;
            });
            sendJson(response, updated ? 200 : 404, updated || { error: "Booking not found." });
            return;
        }
        if (request.method === "DELETE") {
            const removed = await serializeWrite(async () => {
                const bookings = await readBookings();
                const remaining = bookings.filter(b => b.id !== id);
                if (remaining.length === bookings.length) return false;
                await writeBookings(remaining);
                return true;
            });
            sendJson(response, removed ? 200 : 404, removed ? { deleted: id } : { error: "Booking not found." });
            return;
        }
    }

    if (pathname === "/api/bookings" && request.method === "DELETE") {
        if (!requireAdmin(request, response)) return;
        await serializeWrite(() => writeBookings([]));
        sendJson(response, 200, { deleted: true });
        return;
    }

    sendJson(response, 404, { error: "API route not found." });
}

const server = http.createServer(async (request, response) => {
    let url;
    try {
        url = new URL(request.url, "http://localhost");
    } catch {
        response.writeHead(400);
        response.end("Bad request");
        return;
    }

    if (url.pathname.startsWith("/api/")) {
        try {
            await handleApi(request, response, url);
        } catch (error) {
            console.error("API request failed:", error.message);
            if (!response.headersSent) {
                sendJson(response, error.status || 500, { error: error.status ? error.message : "Unable to process request." });
            }
        }
        return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end("Method not allowed");
        return;
    }

    let pathname;
    try {
        pathname = decodeURIComponent(url.pathname);
    } catch {
        response.writeHead(400);
        response.end("Bad request");
        return;
    }

    const filePath = path.resolve(root, `.${pathname}`);
    const relativePath = path.relative(root, filePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
    }

    fs.stat(filePath, (statError, stats) => {
        const target = !statError && stats.isDirectory()
            ? path.join(filePath, "index.html")
            : filePath;

        fs.readFile(target, (readError, contents) => {
            if (readError) {
                response.writeHead(readError.code === "ENOENT" ? 404 : 500);
                response.end(readError.code === "ENOENT" ? "Not found" : "Unable to read file");
                return;
            }

            response.writeHead(200, {
                "Content-Type": mimeTypes[path.extname(target).toLowerCase()] || "application/octet-stream"
            });
            response.end(request.method === "HEAD" ? undefined : contents);
        });
    });
});

server.on("error", (error) => {
    console.error(`Unable to start smart parking web server: ${error.message}`);
    process.exitCode = 1;
});

server.listen(8080, "0.0.0.0", () => {
    console.log("Smart parking web server listening on port 8080");
    console.log(`Shared bookings are stored in ${bookingsFile}`);
});
