require("dotenv").config();

const path = require("node:path");
const { createHash, randomBytes, randomInt, timingSafeEqual } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");

const app = express();
const port = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGODB_URI;
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const demoAccountEmails = new Set([
    "juan.delacruz@example.com",
    "andrea.reyes@example.com",
    "carlo.mendoza@example.com",
    "sofia.villanueva@example.com",
    "marco.tan@example.com",
    "maria.santos@example.com",
    "ramon.cruz@example.com",
    "anna.lim@example.com",
    "joel.reyes@example.com",
    "admin@example.com"
]);
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
    studentNumber: { type: String, trim: true },
    facultyNumber: { type: String, trim: true },
    program: { type: String, trim: true, default: "" },
    college: { type: String, trim: true, default: "" },
    isActive: { type: Boolean }
}, { timestamps: true, strict: false });

const facultySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    college: { type: String, trim: true, default: "" },
    department: { type: String, required: true, trim: true },
    office: { type: String, trim: true, default: "" },
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
    location: { type: String, required: true, trim: true },
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
    college: { type: String, default: "" },
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
    const profile = {
        id: String(account._id),
        name: account.fullName || account.name || "",
        email: account.email,
        role,
        studentNumber: student?.studentNumber || account.studentId || account.studentNumber || account.email,
        program: account.program || student?.program || account.department || "",
        college: account.college || ""
    };
    if (role === "Faculty") {
        const faculty = await Faculty.findOne({ email: account.email }).lean();
        if (faculty) {
            Object.assign(profile, {
                facultyId: String(faculty._id),
                title: faculty.title,
                college: faculty.college || account.college || "",
                department: faculty.department,
                office: faculty.office,
                description: faculty.description || ""
            });
        }
    }
    return profile;
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
            $set: {
                fullName: name,
                email: email.toLowerCase(),
                role: storedRole(role),
                isActive: true
            }
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
        if (demoAccountEmails.has(email)) continue;
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

async function migrateSlotLocations() {
    const records = await mongoose.connection.db.collection("slots").find({
        $or: [{ location: { $exists: false } }, { location: "" }]
    }).toArray();
    for (const record of records) {
        const faculty = await Faculty.findById(record.facultyId).select("office").lean();
        await mongoose.connection.db.collection("slots").updateOne(
            { _id: record._id },
            { $set: { location: faculty?.office || "Room to be confirmed" } }
        );
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
        const escapedEmail = user.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter = {
            $or: [
                { studentEmail: new RegExp(`^${escapedEmail}$`, "i") },
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
    const idNumber = String(request.body.idNumber || "").trim();
    const idField = role === "Student" ? "studentNumber" : role === "Faculty" ? "facultyNumber" : null;
    const program = role === "Student" ? String(request.body.program || "").trim() : "";
    const college = role === "Faculty" ? String(request.body.college || "").trim() : "";
    if (idField && !idNumber) {
        return response.status(400).json({ error: `Enter an ID number for this ${role.toLowerCase()} account.` });
    }
    if (role === "Student" && !program) {
        return response.status(400).json({ error: "Enter a program for this student account." });
    }
    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (await Account.exists({ email: new RegExp(`^${escapedEmail}$`, "i") })) {
        return response.status(409).json({ error: "An account with this email already exists." });
    }
    if (idField) {
        const escapedIdNumber = idNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (await Account.exists({ [idField]: new RegExp(`^${escapedIdNumber}$`, "i") })) {
            return response.status(409).json({ error: `A ${role.toLowerCase()} account with this ID number already exists.` });
        }
        if (role === "Student") {
            const linkedStudent = await Student.findOne({ email });
            if (linkedStudent && linkedStudent.studentNumber.toLowerCase() !== idNumber.toLowerCase()) {
                return response.status(409).json({ error: "The ID number must match the existing student profile." });
            }
            const escapedStudentNumber = idNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (await Student.exists({
                ...(linkedStudent ? { _id: { $ne: linkedStudent._id } } : {}),
                studentNumber: new RegExp(`^${escapedStudentNumber}$`, "i")
            })) {
                return response.status(409).json({ error: "A student profile with this ID number already exists." });
            }
        }
    }
    const account = await Account.create({
        fullName: name,
        email,
        role: storedRole(role),
        ...(idField ? { [idField]: idNumber } : {}),
        ...(role === "Student" ? { program } : {}),
        ...(role === "Faculty" ? { college } : {}),
        isActive: true
    });
    response.status(201).json(serializeAccount(account));
}));

app.patch("/api/accounts/:id", asyncRoute(async (request, response) => {
    const account = await Account.findById(request.params.id);
    if (!account) return response.status(404).json({ error: "Account not found." });

    const hasAccountEdits = ["name", "email", "idNumber", "program", "college"].some((field) => request.body[field] !== undefined);
    if (!hasAccountEdits && request.body.status === undefined) {
        return response.status(400).json({ error: "Provide account changes or a valid status." });
    }
    if (request.body.status !== undefined && !["Active", "Suspended"].includes(request.body.status)) {
        return response.status(400).json({ error: "Account status must be Active or Suspended." });
    }
    if (request.body.role !== undefined && normalizeRole(request.body.role) !== normalizeRole(account.role)) {
        return response.status(400).json({ error: "An account's role cannot be changed." });
    }

    if (hasAccountEdits) {
        const name = String(request.body.name ?? account.fullName ?? account.name ?? "").trim();
        const email = String(request.body.email ?? account.email).trim().toLowerCase();
        const role = normalizeRole(account.role);
        const idField = role === "Student" ? "studentNumber" : role === "Faculty" ? "facultyNumber" : null;
        const idNumber = String(request.body.idNumber ?? account[idField] ?? "").trim();
        const program = role === "Student" ? String(request.body.program ?? account.program ?? "").trim() : "";
        const college = role === "Faculty" ? String(request.body.college ?? account.college ?? "").trim() : "";
        if (!name) return response.status(400).json({ error: "Enter the account name." });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return response.status(400).json({ error: "Please enter a valid email address." });
        }

        const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (await Account.exists({ _id: { $ne: account._id }, email: new RegExp(`^${escapedEmail}$`, "i") })) {
            return response.status(409).json({ error: "An account with this email already exists." });
        }

        let studentProfile = null;
        let facultyProfile = null;
        if (role === "Student") {
            studentProfile = await Student.findOne({ email: account.email });
            const profileEmailExists = await Student.exists({
                ...(studentProfile ? { _id: { $ne: studentProfile._id } } : {}),
                email: new RegExp(`^${escapedEmail}$`, "i")
            });
            if (profileEmailExists) {
                return response.status(409).json({ error: "A student profile with this email already exists." });
            }
            const profileIdExists = idNumber ? await Student.exists({
                ...(studentProfile ? { _id: { $ne: studentProfile._id } } : {}),
                studentNumber: new RegExp(`^${idNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")
            }) : false;
            if (!idNumber || profileIdExists) {
                return response.status(profileIdExists ? 409 : 400).json({
                    error: profileIdExists ? "A student profile with this ID number already exists." : "Enter an ID number for this student account."
                });
            }
        } else if (role === "Faculty") {
            facultyProfile = await Faculty.findOne({ email: account.email });
            if (facultyProfile) {
                const profileEmailExists = await Faculty.exists({
                    _id: { $ne: facultyProfile._id },
                    email: new RegExp(`^${escapedEmail}$`, "i")
                });
                if (profileEmailExists) {
                    return response.status(409).json({ error: "A faculty profile with this email already exists." });
                }
            }
        }

        if (idField) {
            if (!idNumber) {
                return response.status(400).json({ error: `Enter an ID number for this ${role.toLowerCase()} account.` });
            }
            const escapedIdNumber = idNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (await Account.exists({
                _id: { $ne: account._id },
                [idField]: new RegExp(`^${escapedIdNumber}$`, "i")
            })) {
                return response.status(409).json({ error: `A ${role.toLowerCase()} account with this ID number already exists.` });
            }
            account[idField] = idNumber;
        }
        if (role === "Student" && !program) {
            return response.status(400).json({ error: "Enter a program for this student account." });
        }

        const previousEmail = account.email;
        account.fullName = name;
        account.email = email;
        if (role === "Student") account.program = program;
        if (role === "Faculty") account.college = college;
        if (request.body.status !== undefined) {
            account.isActive = request.body.status === "Active";
        }
        if (studentProfile) {
            studentProfile.name = name;
            studentProfile.email = email;
            studentProfile.studentNumber = idNumber;
            studentProfile.program = program;
            await studentProfile.save();
            const escapedPreviousEmail = previousEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            await Consultation.updateMany(
                { studentEmail: new RegExp(`^${escapedPreviousEmail}$`, "i") },
                { $set: { studentEmail: email } }
            );
        }
        if (facultyProfile) {
            facultyProfile.name = name;
            facultyProfile.email = email;
            facultyProfile.college = college;
            await facultyProfile.save();
        }
        await account.save();
    } else {
        account.isActive = request.body.status === "Active";
        await account.save();
    }
    response.json(serializeAccount(account));
}));

app.post("/api/faculty", requireFields(["name", "title", "email", "department"]), asyncRoute(async (request, response) => {
    const faculty = await Faculty.create(request.body);
    await upsertUserForProfile({ name: faculty.name, email: faculty.email, role: "Faculty" });
    response.status(201).json(serialize(faculty));
}));

app.patch("/api/faculty/me", asyncRoute(async (request, response) => {
    const user = await currentUser(request);
    if (!user || user.role !== "Faculty") {
        return response.status(403).json({ error: "An active faculty account is required to update this profile." });
    }
    const faculty = await Faculty.findOne({ email: user.email });
    if (!faculty) return response.status(404).json({ error: "Faculty profile not found." });

    const fields = ["name", "title", "college", "department", "description"];
    for (const field of fields) {
        if (request.body[field] !== undefined) faculty[field] = String(request.body[field]).trim();
    }
    if (!faculty.name || !faculty.title || !faculty.department) {
        return response.status(400).json({ error: "Name, title, and department are required." });
    }
    await faculty.save();
    await upsertUserForProfile({ name: faculty.name, email: faculty.email, role: "Faculty" });
    response.json(serialize(faculty));
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

app.post("/api/slots", requireFields(["facultyId", "date", "start", "end", "location", "capacity"]), asyncRoute(async (request, response) => {
    const start = timeInMinutes(request.body.start);
    const end = timeInMinutes(request.body.end);
    if (start === null || end === null || start >= end) {
        return response.status(400).json({ error: "Slot end time must be after its start time." });
    }
    if (!String(request.body.location).trim()) {
        return response.status(400).json({ error: "Enter the room or location for this slot." });
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
    if (request.body.location !== undefined && !String(request.body.location).trim()) {
        return response.status(400).json({ error: "Enter the room or location for this slot." });
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
    const required = ["facultyId", "date", "slotId"];
    const missing = required.filter((field) =>
        request.body[field] === undefined || request.body[field] === null || request.body[field] === ""
    );
    if (missing.length) {
        return response.status(400).json({ error: `Required fields: ${missing.join(", ")}` });
    }
    const reason = String(request.body.reason || "").trim();

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
            college: faculty.college || "",
            department: faculty.department,
            location: slot.location,
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
    if (await Policy.countDocuments() === 0) await Policy.create({ key: "default" });
}

mongoose.connect(mongoUri)
    .then(migrateLegacyAccounts)
    .then(seedIfEmpty)
    .then(migrateLegacySlots)
    .then(migrateSlotLocations)
    .then(migrateLegacyAppointments)
    .then(() => app.listen(port, () => console.log(`ConsultHub is available at http://localhost:${port}`)))
    .catch((error) => {
        console.error("Unable to connect to MongoDB:", error.message);
        process.exitCode = 1;
    });
