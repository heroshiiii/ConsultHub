const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const accountData = [
    { name: "Juan Dela Cruz", email: "juan.delacruz@student.slsu.edu.ph", role: "Student", status: "Active" },
    { name: "Maria Santos", email: "maria.santos@slsu.edu.ph", role: "Faculty", status: "Active" },
    { name: "Ramon Cruz", email: "ramon.cruz@slsu.edu.ph", role: "Faculty", status: "Active" },
    { name: "Anna Lim", email: "anna.lim@slsu.edu.ph", role: "Faculty", status: "Active" },
    { name: "Joel Reyes", email: "joel.reyes@slsu.edu.ph", role: "Faculty", status: "Active" },
    { name: "Jessa Villanueva", email: "jessa.villanueva@student.slsu.edu.ph", role: "Student", status: "Active" },
    { name: "Philip Ramos", email: "philip.ramos@student.slsu.edu.ph", role: "Student", status: "Active" },
    { name: "Liza Abad", email: "liza.abad@student.slsu.edu.ph", role: "Student", status: "Active" },
    { name: "Carlo Mendoza", email: "carlo.mendoza@student.slsu.edu.ph", role: "Student", status: "Active" },
    { name: "System Administrator", email: "admin@slsu.edu.ph", role: "Administrator", status: "Active" }
];

const facultyData = [
    { name: "Maria Santos", title: "Associate Professor", email: "maria.santos@slsu.edu.ph", department: "Computer Science", office: "CS Building Room 204", workload: 8, slots: 5 },
    { name: "Ramon Cruz", title: "Assistant Professor", email: "ramon.cruz@slsu.edu.ph", department: "Mathematics", office: "Math Building Room 108", workload: 7, slots: 3 },
    { name: "Anna Lim", title: "Professor", email: "anna.lim@slsu.edu.ph", department: "Information Technology", office: "IT Building Room 312", workload: 9, slots: 4 },
    { name: "Joel Reyes", title: "Instructor", email: "joel.reyes@slsu.edu.ph", department: "English", office: "Liberal Arts Building Room 105", workload: 5, slots: 2 }
];

const studentData = [
    { name: "Juan Dela Cruz", email: "juan.delacruz@student.slsu.edu.ph", program: "BS Computer Science", year: "3rd Year" },
    { name: "Jessa Villanueva", email: "jessa.villanueva@student.slsu.edu.ph", program: "BS Mathematics", year: "2nd Year" },
    { name: "Philip Ramos", email: "philip.ramos@student.slsu.edu.ph", program: "BS Information Technology", year: "4th Year" },
    { name: "Liza Abad", email: "liza.abad@student.slsu.edu.ph", program: "BA English", year: "3rd Year" },
    { name: "Carlo Mendoza", email: "carlo.mendoza@student.slsu.edu.ph", program: "BS Computer Science", year: "1st Year" },
    { name: "Sofia Villanueva", email: "sofia.villanueva@student.slsu.edu.ph", program: "BS Information Technology", year: "2nd Year" }
];

const consultationData = [
    { student: "Juan Dela Cruz", faculty: "Maria Santos", department: "Computer Science", date: "2026-10-21", time: "10:00 AM – 11:00 AM", status: "Completed" },
    { student: "Jessa Villanueva", faculty: "Ramon Cruz", department: "Mathematics", date: "2026-10-20", time: "1:00 PM – 2:00 PM", status: "Completed" },
    { student: "Philip Ramos", faculty: "Anna Lim", department: "Information Technology", date: "2026-10-19", time: "9:30 AM – 10:30 AM", status: "No Show" },
    { student: "Liza Abad", faculty: "Joel Reyes", department: "English", date: "2026-10-28", time: "3:00 PM – 4:00 PM", status: "Confirmed" },
    { student: "Carlo Mendoza", faculty: "Maria Santos", department: "Computer Science", date: "2026-10-29", time: "11:00 AM – 12:00 PM", status: "Confirmed" },
    { student: "Sofia Villanueva", faculty: "Anna Lim", department: "Information Technology", date: "2026-10-30", time: "1:00 PM – 2:00 PM", status: "Confirmed" },
    { student: "Juan Dela Cruz", faculty: "Ramon Cruz", department: "Mathematics", date: "2026-10-31", time: "10:00 AM – 11:00 AM", status: "Pending" },
    { student: "Jessa Villanueva", faculty: "Joel Reyes", department: "English", date: "2026-11-02", time: "2:00 PM – 3:00 PM", status: "Confirmed" }
];

let toastTimer;

function showToast(message) {
    const toast = $("#toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function showPage(page) {
    $$(".page-view").forEach((section) => {
        section.classList.toggle("hidden", section.id !== page);
    });

    $$(".nav-link").forEach((button) => {
        button.classList.toggle("active", button.dataset.view === page);
    });

    if (page === "overview") renderOverview();
    if (page === "accounts") renderAccounts();
    if (page === "faculty") renderFacultyOverview();
    if (page === "students") renderStudents();
    if (page === "system") renderSystem();
    if (page === "records") renderRecords();

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function formatDate(dateString) {
    return new Date(`${dateString}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
    });
}

function initials(name) {
    return name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function statusClass(status) {
    const safe = String(status).toLowerCase().replace(/\s+/g, "-");
    return safe;
}

function renderOverview() {
    $("#accountCount").textContent = accountData.length;
    $("#consultationCount").textContent = consultationData.length;
    $("#completedCount").textContent = consultationData.filter((item) => item.status === "Completed").length;
    $("#missedCount").textContent = consultationData.filter((item) => item.status === "No Show").length;
}

function renderAccounts() {
    $("#accountsList").innerHTML = accountData.map((account) => `
        <article class="data-card">
            <span class="avatar">${initials(account.name)}</span>
            <div class="data-primary"><strong>${escapeHTML(account.name)}</strong><small>${escapeHTML(account.email)}</small></div>
            <span class="data-secondary">${escapeHTML(account.role)}</span>
            <span class="status-pill confirmed">${escapeHTML(account.status)}</span>
        </article>
    `).join("");
}

function renderFacultyOverview() {
    $("#facultyOverview").innerHTML = facultyData.map((faculty) => `
        <article class="data-card">
            <span class="avatar faculty-avatar">${initials(faculty.name)}</span>
            <div class="data-primary"><strong>${escapeHTML(faculty.title)} ${escapeHTML(faculty.name)}</strong><small>${escapeHTML(faculty.email)}</small></div>
            <span class="data-secondary">${escapeHTML(faculty.department)}</span>
            <span class="data-secondary">${escapeHTML(faculty.office)}</span>
            <span class="status-pill confirmed">${faculty.slots} open slots</span>
        </article>
    `).join("");
}

function renderStudents() {
    $("#studentsList").innerHTML = studentData.map((student) => `
        <article class="data-card">
            <span class="avatar student-avatar">${initials(student.name)}</span>
            <div class="data-primary"><strong>${escapeHTML(student.name)}</strong><small>${escapeHTML(student.email)}</small></div>
            <span class="data-secondary">${escapeHTML(student.program)}</span>
            <span class="status-pill confirmed">${escapeHTML(student.year)}</span>
        </article>
    `).join("");
}

function renderSystem() {
    const settings = [
        { title: "Consultation duration", value: "60 minutes", detail: "Default session length" },
        { title: "Advance booking window", value: "14 days", detail: "How far ahead students can book" },
        { title: "Check-in availability", value: "Enabled", detail: "Students can check in on appointment day" },
        { title: "No-show marking", value: "Automatic", detail: "Missed sessions are marked after the slot ends" }
    ];

    $("#systemList").innerHTML = settings.map((setting) => `
        <article class="setting-card">
            <span class="management-icon blue">⚙</span>
            <div><strong>${escapeHTML(setting.title)}</strong><small>${escapeHTML(setting.detail)}</small></div>
            <span class="setting-value">${escapeHTML(setting.value)}</span>
        </article>
    `).join("");
}

function renderRecords() {
    $("#recordsList").innerHTML = consultationData.map((record) => `
        <article class="record-card">
            <div class="record-person"><span class="avatar">${initials(record.student)}</span><div class="data-primary"><strong>${escapeHTML(record.student)}</strong><small>${escapeHTML(record.department)}</small></div></div>
            <div class="data-primary"><strong>${escapeHTML(record.faculty)}</strong><small>Faculty member</small></div>
            <div class="data-primary"><strong>${escapeHTML(formatDate(record.date))}</strong><small>${escapeHTML(record.time)}</small></div>
            <span class="status-pill ${statusClass(record.status)}">${escapeHTML(record.status)}</span>
        </article>
    `).join("");
}
$$(".nav-link").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.view));
});

$$("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.go));
});

renderOverview();
