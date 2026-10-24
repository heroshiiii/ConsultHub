require("dotenv").config();

const path = require("node:path");
const { createHash, randomBytes, randomInt, timingSafeEqual } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");

const app = express();
const port = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGODB_URI;
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const sessions = new Map();
const sessionCookie = "consulthub_session";
const otpLifetimeMs = 5 * 60 * 1000;
const otpResendDelayMs = 30 * 1000;
const otpMaxAttempts = 5;
const otpChallenges = new Map();

if (!mongoUri) {
    throw new Error("MONGODB_URI is required. Copy .env.example to .env and configure MongoDB.");
}

app.use(express.json({ limit: "100kb" }));

const accountSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    role: { type: String, required: true, trim: true, lowercase: true },
    isActive: { type: Boolean }
}, { timestamps: true, strict: false });

const facultySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    department: { type: String, required: true, trim: true },
    office: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    color: { type: String, default: "blue" },
    workload: { type: Number, default: 0 }
}, { timestamps: true });

const studentSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    studentNumber: { type: String, required: true, trim: true, unique: true },
    program: { type: String, required: true, trim: true },
    year: { type: String, required: true, trim: true },
    section: { type: String, required: true, trim: true }
}, { timestamps: true });

const slotSchema = new mongoose.Schema({
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", required: true },
    date: { type: String, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    capacity: { type: Number, required: true, min: 1, max: 20 },
    booked: { type: Number, default: 0, min: 0 }
}, { timestamps: true });
slotSchema.index({ facultyId: 1, date: 1, start: 1 }, { unique: true });

const consultationSchema = new mongoose.Schema({
    studentId: { type: String, required: true, trim: true },
    studentName: { type: String, required: true, trim: true },
    studentEmail: { type: String, required: true, trim: true, lowercase: true },
    studentNumber: { type: String, default: "" },
    program: { type: String, default: "" },
    facultyName: { type: String, required: true, trim: true },
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", default: null },
    department: { type: String, required: true },
    location: { type: String, required: true },
    slotId: { type: String, default: "" },
    date: { type: String, required: true },
    timeSlot: { type: String, required: true },
    reason: { type: String, default: "" },
    status: { type: String, enum: ["upcoming", "completed", "no-show", "cancelled"], default: "upcoming" },
    checkedIn: { type: Boolean, default: false },
    checkedAt: { type: String, default: "" }
}, { timestamps: true });
consultationSchema.index(
    { slotId: 1, studentNumber: 1 },
    { unique: true, partialFilterExpression: { status: "upcoming", slotId: { $type: "string" } } }
);

const policySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, default: "default" },
    checkinWindow: { type: Number, default: 20, min: 0, max: 180 },
    defaultCapacity: { type: Number, default: 5, min: 1, max: 100 },
    automaticNoShow: { type: Boolean, default: true },
    automaticCompletion: { type: Boolean, default: true }
}, { timestamps: true });

const Account = mongoose.model("Account", accountSchema, "users");
const Faculty = mongoose.model("Faculty", facultySchema);
const Student = mongoose.model("Student", studentSchema);
const Slot = mongoose.model("Slot", slotSchema);
const Consultation = mongoose.model("Consultation", consultationSchema, "appointments");
const Policy = mongoose.model("Policy", policySchema);

function normalizeRole(role) {
    const roles = {
        student: "Student",
        faculty: "Faculty",
        admin: "Administrator",
        administrator: "Administrator"
    };
    return roles[String(role || "").trim().toLowerCase()] || null;
}

function storedRole(role) {
    return {
        Student: "student",
        Faculty: "faculty",
        Administrator: "admin"
    }[normalizeRole(role)];
}

function serializeAccount(account) {
    const value = account.toObject ? account.toObject() : account;
    const role = normalizeRole(value.role);
    const active = typeof value.isActive === "boolean"
        ? value.isActive
        : String(value.status || "").trim().toLowerCase() === "active";
    return {
        ...value,
        name: value.fullName || value.name || "",
        role: role || value.role,
        status: active ? "Active" : "Suspended",
        id: String(value._id || value.id),
        _id: undefined,
        __v: undefined
    };
}

async function findActiveLoginAccount(email) {
    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const account = await Account.findOne({
        email: new RegExp(`^${escapedEmail}$`, "i")
    });
    const isActive = typeof account?.isActive === "boolean"
        ? account.isActive
        : String(account?.status || "").trim().toLowerCase() === "active";
    if (!account || !isActive) return null;
    const role = normalizeRole(account.role);
    return role ? { id: String(account.id), email: account.email, role } : null;
}

async function findUserProfile(email) {
    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const account = await Account.findOne({ email: new RegExp(`^${escapedEmail}$`, "i") }).lean();
    if (!account) return null;

    const isActive = typeof account.isActive === "boolean"
        ? account.isActive
        : String(account.status || "").trim().toLowerCase() === "active";
    const role = normalizeRole(account.role);
    if (!isActive || !role) return null;

    const student = role === "Student"
        ? await Student.findOne({ email: account.email }).lean()
        : null;
    return {
        id: String(account._id),
        name: account.fullName || account.name || "",
        email: account.email,
        role,
        studentNumber: student?.studentNumber || account.studentId || account.studentNumber || account.email,
        program: student?.program || account.program || account.department || ""
    };
}

async function currentUser(request) {
    const token = readCookie(request, sessionCookie);
    const session = token ? sessions.get(token) : null;
    return session && session.expiresAt > Date.now()
        ? findUserProfile(session.email)
        : null;
}

async function upsertUserForProfile({ name, email, role }) {
    await Account.findOneAndUpdate(
        { email: email.toLowerCase() },
        {
            $set: { fullName: name, email: email.toLowerCase(), role: storedRole(role) },
            $setOnInsert: { isActive: true }
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
}

async function migrateLegacyAccounts() {
    const legacyAccounts = mongoose.connection.db.collection("accounts");
    const records = await legacyAccounts.find().toArray();
    for (const record of records) {
        const name = String(record.fullName || record.name || "").trim();
        const email = String(record.email || "").trim().toLowerCase();
        const role = normalizeRole(record.role);
        if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !role) continue;
        const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        await Account.updateOne(
            { email: new RegExp(`^${escapedEmail}$`, "i") },
            {
                $setOnInsert: {
                    fullName: name,
                    email,
                    role: storedRole(role),
                    isActive: typeof record.isActive === "boolean"
                        ? record.isActive
                        : String(record.status || "").trim().toLowerCase() === "active"
                }
            },
            { upsert: true, setDefaultsOnInsert: true }
        );
    }
}

async function migrateLegacyAppointments() {
    const db = mongoose.connection.db;
    const appointments = db.collection("appointments");
    const legacy = await db.collection("consultations").find().toArray();
    if (legacy.length) {
        await appointments.bulkWrite(legacy.map((record) => ({
            updateOne: {
                filter: { _id: record._id },
                update: {
                    $setOnInsert: {
                        ...record,
                        studentId: String(record.studentNumber || record.studentId || ""),
                        studentName: record.student || record.studentName || "",
                        studentEmail: record.studentEmail || "",
                        facultyName: record.faculty || record.facultyName || "",
                        timeSlot: record.time || record.timeSlot || "",
                        status: String(record.status || "upcoming").toLowerCase().replace(/\s+/g, "-")
                    }
                },
                upsert: true
            }
        })), { ordered: false });
    }

    const records = await appointments.find({ $or: [
        { studentEmail: { $exists: false } },
        { studentEmail: "" },
        { facultyId: { $exists: false } },
        { timeSlot: { $exists: false } }
    ] }).toArray();
    for (const record of records) {
        const studentId = String(record.studentId || record.studentNumber || "");
        const student = await Student.findOne({ studentNumber: studentId }).lean();
        const user = await Account.findOne({
            $or: [{ studentId }, { fullName: record.studentName || record.student }]
        }).lean();
        const facultyName = record.facultyName || record.faculty || "";
        const faculty = await Faculty.findOne({ name: facultyName }).select("_id");
        const date = normalizeLegacyDate(record.date);
        const status = String(record.status || "upcoming").toLowerCase().replace(/\s+/g, "-");
        await appointments.updateOne({ _id: record._id }, {
            $set: {
                studentId,
                studentName: record.studentName || record.student || student?.name || user?.fullName || "Student",
                studentEmail: record.studentEmail || student?.email || user?.email || "",
                studentNumber: record.studentNumber || studentId,
                program: record.program || student?.program || user?.program || "",
                facultyName,
                facultyId: faculty?._id || (mongoose.isValidObjectId(record.facultyId) ? new mongoose.Types.ObjectId(record.facultyId) : null),
                department: record.department || "",
                location: record.location || "",
                date: date || record.date,
                timeSlot: record.timeSlot || record.time || "",
                reason: record.reason || "",
                status: ["upcoming", "completed", "no-show", "cancelled"].includes(status) ? status : "upcoming",
                checkedIn: Boolean(record.checkedIn),
                checkedAt: record.checkedAt || "",
                slotId: record.slotId ? String(record.slotId) : `legacy:${record._id}`
            }
        });
    }
}

async function migrateLegacySlots() {
    const collection = mongoose.connection.db.collection("slots");
    const records = await collection.find({ $or: [
        { start: { $exists: false } },
        { end: { $exists: false } },
        { capacity: { $exists: false } }
    ] }).toArray();
    for (const record of records) {
        const faculty = await Faculty.findOne({ name: record.facultyName }).select("_id");
        const date = normalizeLegacyDate(record.date);
        if (!faculty || !date) {
            throw new Error(`Unable to migrate availability slot ${record._id}: matching faculty or valid date not found.`);
        }
        await collection.updateOne({ _id: record._id }, {
            $set: {
                facultyId: faculty._id,
                date,
                start: record.start || record.startTime,
                end: record.end || record.endTime,
                capacity: record.capacity || record.maxStudents,
                booked: record.booked ?? record.reservedCount ?? 0
            },
            $unset: {
                facultyName: "",
                startTime: "",
                endTime: "",
                maxStudents: "",
                reservedCount: ""
            }
        });
    }
}

function readCookie(request, name) {
    const cookie = request.headers.cookie
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function clearSessionCookie(response) {
    response.clearCookie(sessionCookie, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/"
    });
}

function dashboardForRole(role) {
    return {
        Student: "/student%20demo.html",
        Faculty: "/faculty%20demo.html",
        Administrator: "/admin%20demo.html"
    }[role];
}

function hashOtp(email, salt, code) {
    return createHash("sha256").update(`${email}:${salt}:${code}`).digest();
}

async function sendOtpEmail(email, code) {
    const hasApiKey = Boolean(process.env.BREVO_API_KEY);
    const hasSender = Boolean(process.env.BREVO_SENDER_EMAIL);
    if (!hasApiKey && !hasSender) {
        if (process.env.NODE_ENV === "production") {
            throw Object.assign(new Error("Email delivery is not configured. Contact the administrator."), { statusCode: 503 });
        }
        return "demo";
    }
    if (!hasApiKey || !hasSender) {
        throw Object.assign(new Error("Email delivery is incomplete. Configure both BREVO_API_KEY and BREVO_SENDER_EMAIL."), { statusCode: 503 });
    }

    const senderName = process.env.BREVO_SENDER_NAME || "ConsultHub";
    const result = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "accept": "application/json",
            "api-key": process.env.BREVO_API_KEY,
            "content-type": "application/json"
        },
        body: JSON.stringify({
            sender: { name: senderName, email: process.env.BREVO_SENDER_EMAIL },
            to: [{ email }],
            subject: "Your ConsultHub verification code",
            textContent: `Your ConsultHub verification code is ${code}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`
        })
    });
    if (!result.ok) {
        const details = await result.text();
        console.error("Brevo email delivery failed:", result.status, details);
        throw Object.assign(new Error("Could not send the verification email. Please try again later."), { statusCode: 502 });
    }
    return "email";
}

const protectedPages = new Map([
    ["/student%20demo.html", "Student"],
    ["/faculty%20demo.html", "Faculty"],
    ["/admin%20demo.html", "Administrator"]
]);

app.use(async (request, response, next) => {
    const pageRole = protectedPages.get(request.path);
    const isApiRequest = request.path.startsWith("/api/");
    const publicAuthRoutes = new Set([
        "/api/auth/request-otp",
        "/api/auth/verify-otp",
        "/api/auth/logout"
    ]);
    const isPublicApi = request.path === "/api/health" ||
        (publicAuthRoutes.has(request.path) && request.method === "POST");

    if (!pageRole && (!isApiRequest || isPublicApi)) return next();

    const token = readCookie(request, sessionCookie);
    const session = token ? sessions.get(token) : null;
    if (!session || session.expiresAt <= Date.now()) {
        if (token) sessions.delete(token);
        clearSessionCookie(response);
        if (isApiRequest) return response.status(401).json({ error: "Please log in with an active account." });
        return response.redirect(302, "/landing%20page.html");
    }

    try {
        const account = await findActiveLoginAccount(session.email);
        if (!account) {
            sessions.delete(token);
            clearSessionCookie(response);
            if (isApiRequest) return response.status(401).json({ error: "This account is inactive. Please contact an administrator." });
            return response.redirect(302, "/landing%20page.html");
        }
        if (pageRole && account.role !== pageRole) {
            return response.redirect(302, dashboardForRole(account.role));
        }
        next();
    } catch (error) {
        next(error);
    }
});

function serialize(document) {
    const value = document.toObject ? document.toObject() : document;
    return { ...value, id: String(value._id || value.id), _id: undefined, __v: undefined };
}

function serializeAppointment(document) {
    const value = document.toObject ? document.toObject() : document;
    const statuses = {
        upcoming: "Confirmed",
        confirmed: "Confirmed",
        completed: "Completed",
        "no-show": "No Show",
        "no show": "No Show",
        cancelled: "Cancelled"
    };
    return {
        ...value,
        student: value.studentName || value.student || "",
        faculty: value.facultyName || value.faculty || "",
        time: value.timeSlot || value.time || "",
        status: statuses[String(value.status || "").toLowerCase()] || value.status || "Confirmed",
        id: String(value._id || value.id),
        _id: undefined,
        __v: undefined
    };
}

function normalizeLegacyDate(value) {
    const text = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const match = text.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+([A-Za-z]+)\s+(\d{1,2})$/i);
    if (match) {
        const month = new Date(`${match[2]} 1, 2000`).getMonth();
        if (Number.isNaN(month)) return "";
        const day = Number(match[3]);
        const now = new Date();
        for (let year = now.getFullYear(); year >= now.getFullYear() - 10; year -= 1) {
            const date = new Date(year, month, day);
            if (date.getMonth() === month && date.getDate() === day &&
                date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase() === match[1].toLowerCase()) {
                return [year, String(month + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
            }
        }
        return "";
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime())
        ? ""
        : [parsed.getFullYear(), String(parsed.getMonth() + 1).padStart(2, "0"), String(parsed.getDate()).padStart(2, "0")].join("-");
}

function asyncRoute(handler) {
    return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function requireFields(fields) {
    return (request, response, next) => {
        const missing = fields.filter((field) =>
            request.body[field] === undefined || request.body[field] === null || request.body[field] === ""
        );
        if (missing.length) {
            return response.status(400).json({ error: `Required fields: ${missing.join(", ")}` });
        }
        next();
    };
}

function timeInMinutes(value) {
    const match = String(value).match(/^(\d{1,2}):(\d{2})(?:\s(AM|PM))?$/i);
    if (!match) return null;
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (minutes > 59) return null;
    if (match[3]) {
        if (hours < 1 || hours > 12) return null;
        hours = (hours % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0);
    } else if (hours > 23) {
        return null;
    }
    return hours * 60 + minutes;
}

function registerReadRoutes(resource, model, options = {}) {
    app.get(`/api/${resource}`, asyncRoute(async (request, response) => {
        const filters = options.filters
            ? Object.fromEntries(options.filters
                .filter((field) => request.query[field])
                .map((field) => [field, request.query[field]]))
            : {};
        const query = options.populate
            ? model.find(filters).populate(options.populate)
            : model.find(filters);
        const documents = await query.sort(options.sort || { createdAt: 1 });
        response.json(documents.map(serialize));
    }));
}

app.get("/api/accounts", asyncRoute(async (_request, response) => {
    const accounts = await Account.find().sort({ createdAt: 1 });
    response.json(accounts.map(serializeAccount));
}));
registerReadRoutes("faculty", Faculty);
registerReadRoutes("students", Student);
async function listAppointments(request, response) {
    const user = await currentUser(request);
    if (!user) return response.status(401).json({ error: "Please log in again to view appointments." });

    let filter = {};
    if (user.role === "Student") {
        filter = {
            $or: [
                { studentEmail: user.email },
                { studentNumber: user.studentNumber },
                { studentId: user.studentNumber },
                { student: user.name }
            ]
        };
    } else if (user.role === "Faculty") {
        const faculty = await Faculty.findOne({ email: user.email }).select("_id");
        if (!faculty) return response.json([]);
        filter = { $or: [{ facultyId: faculty.id }, { facultyName: faculty.name }] };
    }

    const appointments = await Consultation.find(filter).sort({ date: -1, createdAt: -1 });
    response.json(appointments.map(serializeAppointment));
}

app.get("/api/appointments", asyncRoute(listAppointments));
app.get("/api/consultations", asyncRoute(listAppointments));

app.get("/api/auth/me", asyncRoute(async (request, response) => {
    const user = await currentUser(request);
    if (!user) return response.status(401).json({ error: "Please log in again." });
    response.json(user);
}));

app.get("/api/slots", asyncRoute(async (request, response) => {
    const filter = request.query.facultyId ? { facultyId: request.query.facultyId } : {};
    const slots = await Slot.find(filter).sort({ date: 1, start: 1 });
    response.json(slots.map(serialize));
}));

app.get("/api/policies", asyncRoute(async (_request, response) => {
    const policy = await Policy.findOne({ key: "default" });
    response.json(serialize(policy));
}));

app.post("/api/auth/request-otp", requireFields(["email"]), asyncRoute(async (request, response) => {
    const email = String(request.body.email).trim().toLowerCase();
    const validFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!validFormat) {
        return response.status(400).json({ error: "Please enter a valid email address." });
    }

    const account = await findActiveLoginAccount(email);
    if (!account) {
        return response.status(404).json({ error: "This email is not registered to an active account." });
    }

    const previous = otpChallenges.get(email);
    const now = Date.now();
    if (previous && now - previous.sentAt < otpResendDelayMs) {
        return response.status(429).json({
            error: "Please wait before requesting another code.",
            retryAfter: Math.ceil((otpResendDelayMs - (now - previous.sentAt)) / 1000)
        });
    }

    const demoMode = process.env.NODE_ENV !== "production" &&
        !process.env.BREVO_API_KEY && !process.env.BREVO_SENDER_EMAIL;
    const code = demoMode ? "123456" : String(randomInt(0, 1000000)).padStart(6, "0");
    const delivery = await sendOtpEmail(email, code);
    const salt = randomBytes(16).toString("hex");
    otpChallenges.set(email, {
        salt,
        codeHash: hashOtp(email, salt, code),
        expiresAt: now + otpLifetimeMs,
        sentAt: now,
        attempts: 0
    });
    response.json({
        sent: true,
        demoMode: delivery === "demo",
        email,
        expiresIn: otpLifetimeMs / 1000,
        resendAfter: otpResendDelayMs / 1000
    });
}));

app.post("/api/auth/verify-otp", requireFields(["email", "code"]), asyncRoute(async (request, response) => {
    const email = String(request.body.email).trim().toLowerCase();
    const code = String(request.body.code).trim();
    if (!/^\d{6}$/.test(code)) {
        return response.status(400).json({ error: "Enter the 6-digit verification code." });
    }

    const challenge = otpChallenges.get(email);
    if (!challenge || challenge.expiresAt <= Date.now()) {
        otpChallenges.delete(email);
        return response.status(400).json({ error: "This code has expired. Request a new one to continue." });
    }
    if (challenge.attempts >= otpMaxAttempts) {
        otpChallenges.delete(email);
        return response.status(429).json({ error: "Too many incorrect attempts. Request a new code to continue." });
    }

    const submittedHash = hashOtp(email, challenge.salt, code);
    if (!timingSafeEqual(submittedHash, challenge.codeHash)) {
        challenge.attempts += 1;
        if (challenge.attempts >= otpMaxAttempts) otpChallenges.delete(email);
        return response.status(400).json({
            error: challenge.attempts >= otpMaxAttempts
                ? "Too many incorrect attempts. Request a new code to continue."
                : "That code is incorrect. Check it and try again.",
            attemptsRemaining: Math.max(0, otpMaxAttempts - challenge.attempts)
        });
    }

    const account = await findActiveLoginAccount(email);
    otpChallenges.delete(email);
    if (!account) {
        return response.status(404).json({ error: "This email is not registered to an active account." });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + sessionLifetimeMs;
    sessions.set(token, { email: account.email, expiresAt });
    response.cookie(sessionCookie, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: sessionLifetimeMs,
        path: "/"
    });
    response.json({ valid: true, role: account.role, redirect: dashboardForRole(account.role) });
}));

app.post("/api/auth/logout", (request, response) => {
    const token = readCookie(request, sessionCookie);
    if (token) sessions.delete(token);
    clearSessionCookie(response);
    response.status(204).end();
});

app.post("/api/accounts", requireFields(["name", "email", "role"]), asyncRoute(async (request, response) => {
    const name = String(request.body.name).trim();
    const email = String(request.body.email).trim().toLowerCase();
    const role = normalizeRole(request.body.role);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return response.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!role) {
        return response.status(400).json({ error: "Choose a valid account role." });
    }
    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (await Account.exists({ email: new RegExp(`^${escapedEmail}$`, "i") })) {
        return response.status(409).json({ error: "An account with this email already exists." });
    }
    const account = await Account.create({
        fullName: name,
        email,
        role: storedRole(role),
        isActive: true
    });
    response.status(201).json(serializeAccount(account));
}));

app.patch("/api/accounts/:id", asyncRoute(async (request, response) => {
    if (!["Active", "Suspended"].includes(request.body.status)) {
        return response.status(400).json({ error: "Account status must be Active or Suspended." });
    }
    const account = await Account.findByIdAndUpdate(
        request.params.id,
        { isActive: request.body.status === "Active" },
        { new: true, runValidators: true }
    );
    if (!account) return response.status(404).json({ error: "Account not found." });
    response.json(serializeAccount(account));
}));

app.post("/api/faculty", requireFields(["name", "title", "email", "department", "office"]), asyncRoute(async (request, response) => {
    const faculty = await Faculty.create(request.body);
    await upsertUserForProfile({ name: faculty.name, email: faculty.email, role: "Faculty" });
    response.status(201).json(serialize(faculty));
}));

app.patch("/api/faculty/:id", asyncRoute(async (request, response) => {
    const previous = await Faculty.findById(request.params.id);
    if (!previous) return response.status(404).json({ error: "Faculty member not found." });
    const faculty = await Faculty.findByIdAndUpdate(request.params.id, request.body, { new: true, runValidators: true });
    if (!faculty) return response.status(404).json({ error: "Faculty member not found." });
    await upsertUserForProfile({ name: faculty.name, email: faculty.email, role: "Faculty" });
    response.json(serialize(faculty));
}));

app.delete("/api/faculty/:id", asyncRoute(async (request, response) => {
    const relatedSlot = await Slot.exists({ facultyId: request.params.id });
    const relatedConsultation = await Consultation.exists({ facultyId: request.params.id });
    if (relatedSlot || relatedConsultation) {
        return response.status(409).json({ error: "Faculty with consultation slots or records cannot be deleted." });
    }
    const faculty = await Faculty.findByIdAndDelete(request.params.id);
    if (!faculty) return response.status(404).json({ error: "Faculty member not found." });
    response.status(204).end();
}));

app.post("/api/students", requireFields(["name", "email", "studentNumber", "program", "year", "section"]), asyncRoute(async (request, response) => {
    const student = await Student.create(request.body);
    await upsertUserForProfile({ name: student.name, email: student.email, role: "Student" });
    response.status(201).json(serialize(student));
}));

app.patch("/api/students/:id", asyncRoute(async (request, response) => {
    const previous = await Student.findById(request.params.id);
    if (!previous) return response.status(404).json({ error: "Student not found." });
    const student = await Student.findByIdAndUpdate(request.params.id, request.body, { new: true, runValidators: true });
    if (!student) return response.status(404).json({ error: "Student not found." });
    await upsertUserForProfile({ name: student.name, email: student.email, role: "Student" });
    response.json(serialize(student));
}));

app.post("/api/slots", requireFields(["facultyId", "date", "start", "end", "capacity"]), asyncRoute(async (request, response) => {
    const start = timeInMinutes(request.body.start);
    const end = timeInMinutes(request.body.end);
    if (start === null || end === null || start >= end) {
        return response.status(400).json({ error: "Slot end time must be after its start time." });
    }
    if (!await Faculty.exists({ _id: request.body.facultyId })) {
        return response.status(404).json({ error: "Faculty member not found." });
    }
    const slot = await Slot.create(request.body);
    response.status(201).json(serialize(slot));
}));

app.patch("/api/slots/:id", asyncRoute(async (request, response) => {
    const slot = await Slot.findById(request.params.id);
    if (!slot) return response.status(404).json({ error: "Slot not found." });
    const start = timeInMinutes(request.body.start ?? slot.start);
    const end = timeInMinutes(request.body.end ?? slot.end);
    if (start === null || end === null || start >= end) {
        return response.status(400).json({ error: "Slot end time must be after its start time." });
    }
    const capacity = request.body.capacity ?? slot.capacity;
    const reservations = slot.booked;
    if (capacity < reservations) {
        return response.status(409).json({ error: `Capacity cannot be lower than the ${reservations} existing reservations.` });
    }
    Object.assign(slot, request.body);
    await slot.save();
    response.json(serialize(slot));
}));

app.delete("/api/slots/:id", asyncRoute(async (request, response) => {
    const slot = await Slot.findById(request.params.id);
    if (!slot) return response.status(404).json({ error: "Slot not found." });
    if (slot.booked > 0) return response.status(409).json({ error: "Slots with existing reservations cannot be deleted." });
    await slot.deleteOne();
    response.status(204).end();
}));

const createAppointment = asyncRoute(async (request, response) => {
    const user = await currentUser(request);
    if (!user || user.role !== "Student") {
        return response.status(403).json({ error: "An active student account is required to book an appointment." });
    }
    const required = ["facultyId", "date", "reason", "slotId"];
    const missing = required.filter((field) =>
        request.body[field] === undefined || request.body[field] === null || request.body[field] === ""
    );
    if (missing.length) {
        return response.status(400).json({ error: `Required fields: ${missing.join(", ")}` });
    }
    const reason = String(request.body.reason).trim();
    if (!reason) return response.status(400).json({ error: "Enter a reason for the appointment." });

    const faculty = await Faculty.findById(request.body.facultyId);
    if (!faculty) return response.status(404).json({ error: "Faculty member not found." });
    const slot = await Slot.findOne({
        _id: request.body.slotId,
        facultyId: faculty.id,
        date: request.body.date
    });
    if (!slot) return response.status(404).json({ error: "No availability exists for that date." });
    const duplicate = await Consultation.exists({
        slotId: slot.id,
        studentNumber: user.studentNumber,
        status: "upcoming"
    });
    if (duplicate) return response.status(409).json({ error: "You already have a confirmed consultation in this slot." });

    const reservedSlot = await Slot.findOneAndUpdate(
        { _id: slot.id, booked: slot.booked, capacity: { $gt: slot.booked } },
        { $inc: { booked: 1 } },
        { new: true }
    );
    if (!reservedSlot) return response.status(409).json({ error: "This consultation slot is full. Refresh and choose another slot." });
    try {
        const consultation = await Consultation.create({
            studentId: user.studentNumber,
            studentName: user.name,
            studentEmail: user.email,
            studentNumber: user.studentNumber,
            program: user.program,
            facultyName: faculty.name,
            department: faculty.department,
            location: faculty.office,
            slotId: slot.id,
            facultyId: faculty.id,
            date: slot.date,
            timeSlot: `${slot.start} – ${slot.end}`,
            reason,
            status: "upcoming"
        });
        response.status(201).json(serializeAppointment(consultation));
    } catch (error) {
        await Slot.updateOne({ _id: slot.id }, { $inc: { booked: -1 } });
        throw error;
    }
});

app.post(["/api/appointments", "/api/consultations"], createAppointment);

const updateAppointment = asyncRoute(async (request, response) => {
    const consultation = await Consultation.findByIdAndUpdate(request.params.id, request.body, { new: true, runValidators: true });
    if (!consultation) return response.status(404).json({ error: "Consultation not found." });
    response.json(serializeAppointment(consultation));
});

app.patch(["/api/appointments/:id", "/api/consultations/:id"], updateAppointment);

app.put("/api/policies", asyncRoute(async (request, response) => {
    const policy = await Policy.findOneAndUpdate(
        { key: "default" },
        { ...request.body, key: "default" },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    response.json(serialize(policy));
}));

app.get("/api/health", (_request, response) => {
    response.json({ status: mongoose.connection.readyState === 1 ? "ok" : "disconnected" });
});

app.get(["/", "/index.html"], (request, response) => {
    if (request.query.logout === "1") {
        const token = readCookie(request, sessionCookie);
        if (token) sessions.delete(token);
        clearSessionCookie(response);
    }
    response.redirect(302, "/landing%20page.html");
});

app.use(express.static(path.join(__dirname)));

app.use((error, _request, response, _next) => {
    if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
        return response.status(400).json({ error: error.message });
    }
    if (error.statusCode) {
        return response.status(error.statusCode).json({ error: error.message });
    }
    if (error.code === 11000) {
        return response.status(409).json({ error: "A record with that email, student number, or slot already exists." });
    }
    console.error(error);
    response.status(500).json({ error: "An unexpected server error occurred." });
});

async function seedIfEmpty() {
    const accounts = [
        ["Juan dela Cruz", "juan.delacruz@example.com", "Student"],
        ["Andrea Reyes", "andrea.reyes@example.com", "Student"],
        ["Carlo Mendoza", "carlo.mendoza@example.com", "Student"],
        ["Sofia Villanueva", "sofia.villanueva@example.com", "Student"],
        ["Marco Tan", "marco.tan@example.com", "Student"],
        ["Dr. Maria Santos", "maria.santos@example.com", "Faculty"],
        ["Prof. Ramon Cruz", "ramon.cruz@example.com", "Faculty"],
        ["Dr. Anna Lim", "anna.lim@example.com", "Faculty"],
        ["Prof. Joel Reyes", "joel.reyes@example.com", "Faculty"],
        ["System Administrator", "admin@example.com", "Administrator"]
    ].map(([name, email, role]) => ({ name, email, role }));
    const faculty = [
        { name: "Dr. Maria Santos", title: "Associate Professor", email: "maria.santos@example.com", department: "Computer Science", office: "CS Building Room 204", description: "Specializes in algorithms, data structures, and software engineering. Available for thesis advising and course inquiries.", color: "blue", workload: 8 },
        { name: "Prof. Ramon Cruz", title: "Assistant Professor", email: "ramon.cruz@example.com", department: "Mathematics", office: "Math Building Room 108", description: "Teaches Calculus, Linear Algebra, and Discrete Mathematics. Research focus on applied mathematics.", color: "cyan", workload: 7 },
        { name: "Dr. Anna Lim", title: "Professor", email: "anna.lim@example.com", department: "Information Technology", office: "IT Building Room 312", description: "Expert in database systems, cloud computing, and network administration. Available for internship endorsements.", color: "purple", workload: 9 },
        { name: "Prof. Joel Reyes", title: "Instructor", email: "joel.reyes@example.com", department: "English", office: "Liberal Arts Building Room 105", description: "Teaches Technical Writing and Communication Arts. Available for thesis writing consultations.", color: "green", workload: 5 }
    ];
    const students = [
        { name: "Juan dela Cruz", email: "juan.delacruz@example.com", studentNumber: "2021-00123", program: "BS Computer Science", year: "Year 3", section: "3A" },
        { name: "Andrea Reyes", email: "andrea.reyes@example.com", studentNumber: "2022-00456", program: "BS Information Technology", year: "Year 2", section: "2B" },
        { name: "Carlo Mendoza", email: "carlo.mendoza@example.com", studentNumber: "2020-00789", program: "BS Computer Science", year: "Year 4", section: "4A" },
        { name: "Sofia Villanueva", email: "sofia.villanueva@example.com", studentNumber: "2023-00321", program: "BS Mathematics", year: "Year 1", section: "1C" },
        { name: "Marco Tan", email: "marco.tan@example.com", studentNumber: "2021-00654", program: "BS Computer Science", year: "Year 3", section: "3B" }
    ];

    for (const [Model, samples] of [[Faculty, faculty], [Student, students]]) {
        for (const sample of samples) {
            const localPart = sample.email.split("@")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const records = await Model.find({
                name: sample.name,
                email: new RegExp(`^${localPart}@`, "i")
            });
            for (const record of records) {
                if (record.email.toLowerCase() === sample.email.toLowerCase()) continue;
                const existing = await Model.findOne({ email: sample.email, _id: { $ne: record.id } }).select("_id");
                if (existing) {
                    throw new Error(`Cannot migrate demo email for ${record.name}: ${sample.email} is already in use.`);
                }
                record.email = sample.email;
                await record.save();
            }
        }
    }

    if (await Account.countDocuments() === 0) {
        await Account.insertMany(accounts.map(({ name, email, role }) => ({
            fullName: name,
            email,
            role: storedRole(role),
            isActive: true
        })));
    }
    if (await Faculty.countDocuments() === 0) await Faculty.insertMany(faculty);
    if (await Student.countDocuments() === 0) await Student.insertMany(students);
    if (await Policy.countDocuments() === 0) await Policy.create({ key: "default" });

    if (await mongoose.connection.db.collection("slots").countDocuments() === 0) {
        const facultyRecords = await Faculty.find();
        const nextMonday = new Date();
        nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
        const date = (offset) => {
            const value = new Date(nextMonday);
            value.setDate(value.getDate() + offset);
            return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
        };
        const defaults = [
            { email: "maria.santos@example.com", offset: 0, start: "10:00 AM", end: "11:00 AM" },
            { email: "maria.santos@example.com", offset: 1, start: "02:00 PM", end: "03:00 PM" },
            { email: "anna.lim@example.com", offset: 0, start: "10:00 AM", end: "11:00 AM" },
            { email: "anna.lim@example.com", offset: 1, start: "02:00 PM", end: "03:00 PM" },
            { email: "ramon.cruz@example.com", offset: 0, start: "01:00 PM", end: "02:00 PM" },
            { email: "joel.reyes@example.com", offset: 1, start: "03:00 PM", end: "04:00 PM" }
        ];
        await Slot.insertMany(defaults.map((item) => ({
            facultyId: facultyRecords.find((member) => member.email === item.email).id,
            date: date(item.offset),
            start: item.start,
            end: item.end,
            capacity: 5
        })));
    }
}

mongoose.connect(mongoUri)
    .then(migrateLegacyAccounts)
    .then(seedIfEmpty)
    .then(migrateLegacySlots)
    .then(migrateLegacyAppointments)
    .then(() => app.listen(port, () => console.log(`ConsultHub is available at http://localhost:${port}`)))
    .catch((error) => {
        console.error("Unable to connect to MongoDB:", error.message);
        process.exitCode = 1;
    });
