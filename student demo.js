
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let appointments = [
    {
        id: 1,
        faculty: "Dr. Anna Lim",
        department: "Information Technology",
        date: "2026-10-13",
        time: "10:00 AM – 11:00 AM",
        location: "IT Building Room 312",
        status: "Confirmed"
    },
    {
        id: 2,
        faculty: "Dr. Maria Santos",
        department: "Computer Science",
        date: "2026-09-11",
        time: "2:00 PM",
        location: "Faculty Office 204",
        status: "Completed",
        checkedIn: true
    },
    {
        id: 3,
        faculty: "Prof. Ramon Cruz",
        department: "Mathematics",
        date: "2026-09-18",
        time: "1:00 PM",
        location: "Math Building Room 105",
        status: "No Show"
    },
    {
        id: 4,
        faculty: "Dr. Maria Santos",
        department: "Computer Science",
        date: "2026-09-25",
        time: "10:00 AM",
        location: "Faculty Office 204",
        status: "Completed",
        checkedIn: true
    }
];

const facultyMembers = [
    {
        name: "Dr. Maria Santos",
        title: "Associate Professor",
        department: "Computer Science",
        office: "CS Building Room 204",
        description: "Specializes in algorithms, data structures, and software engineering. Available for thesis advising and course inquiries.",
        slots: 3,
        color: "blue"
    },
    {
        name: "Prof. Ramon Cruz",
        title: "Assistant Professor",
        department: "Mathematics",
        office: "Math Building Room 108",
        description: "Teaches Calculus, Linear Algebra, and Discrete Mathematics. Research focus on applied mathematics.",
        slots: 1,
        color: "cyan"
    },
    {
        name: "Dr. Anna Lim",
        title: "Professor",
        department: "Information Technology",
        office: "IT Building Room 312",
        description: "Expert in database systems, cloud computing, and network administration. Available for internship endorsements.",
        slots: 2,
        color: "purple"
    },
    {
        name: "Prof. Joel Reyes",
        title: "Instructor",
        department: "English",
        office: "Liberal Arts Building Room 105",
        description: "Teaches Technical Writing and Communication Arts. Available for thesis writing consultations.",
        slots: 1,
        color: "green"
    }
];

let activeFilter = "all";
let activeHistoryFilter = "all";
let selectedFaculty = null;
let toastTimer;

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function initials(name) {
    return name.replace(/^(Dr\.|Prof\.)\s*/, "")
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

function prettyDate(date) {
    return new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric"
    });
}

function shortDate(date) {
    return new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric"
    });
}

function badge(status) {
    const className = status.replace(/\s+/g, "-");

    return `<span class="status ${className}">
        ${escapeHTML(status)}
    </span>`;
}

function showToast(message) {
    const toast = $("#toast");

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function openModal(html) {
    $("#modalContent").innerHTML = html;
    $("#modal").classList.remove("hidden");
}

function closeModal() {
    $("#modal").classList.add("hidden");
}

$("#closeModal").addEventListener("click", closeModal);

$("#modal").addEventListener("click", (event) => {
    if (event.target.id === "modal") closeModal();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
});


// NAVIGATION

function showPage(page) {
    $$(".page-view").forEach((section) => {
        section.classList.toggle("hidden", section.id !== page);
    });

    $$(".nav-link").forEach((button) => {
        button.classList.toggle("active", button.dataset.view === page);
    });

    if (page === "dashboard") renderDashboard();
    if (page === "consultations") renderFaculty();
    if (page === "appointments") renderAppointments();
    if (page === "history") renderHistory();

    window.scrollTo({ top: 0, behavior: "smooth" });
}

$$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.view));
});

$$("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.go));
});


// DASHBOARD

function getUpcoming() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return appointments
        .filter((item) =>
            item.status === "Confirmed" &&
            new Date(item.date + "T12:00:00") >= today
        )
        .sort((a, b) => a.date.localeCompare(b.date));
}

function renderDashboard() {
    const today = new Date();

    $("#dayName").textContent = today.toLocaleDateString("en-US", {
        weekday: "long"
    });

    $("#currentDate").textContent = today.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric"
    });

    const upcoming = getUpcoming();

    $("#upcomingCount").textContent = upcoming.length;
    $("#completedCount").textContent = appointments.filter(
        (item) => item.status === "Completed"
    ).length;
    $("#noShowCount").textContent = appointments.filter(
        (item) => item.status === "No Show"
    ).length;

    const next = upcoming[0];

    $("#nextConsultation").innerHTML = next
        ? `
            <article class="consultation-card">
                <div class="person">
                    <span class="avatar">${initials(next.faculty)}</span>
                    <div class="person-info">
                        <strong>${escapeHTML(next.faculty)}</strong>
                        <small>${escapeHTML(next.department)}</small>
                    </div>
                    ${badge(next.status)}
                </div>

                <div class="details">
                    <div>▦ &nbsp; ${escapeHTML(prettyDate(next.date))}</div>
                    <div>◷ &nbsp; ${escapeHTML(next.time)}</div>
                    <div>⌖ &nbsp; ${escapeHTML(next.location)}</div>
                </div>

                <button class="small-button" data-details="${next.id}">
                    View Details & Check In
                </button>
            </article>
        `
        : `<div class="consultation-card empty">
            No upcoming consultations.<br>
            <button class="small-button" data-go="consultations">
                Find Faculty
            </button>
        </div>`;

    const recent = [...appointments]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3);

    $("#recentActivity").innerHTML = recent.map((item) => `
        <article class="activity-card">
            <div>
                <strong>${escapeHTML(item.faculty)}</strong>
                <p>${escapeHTML(shortDate(item.date))} · ${escapeHTML(item.time)}</p>
            </div>
            ${badge(item.status)}
        </article>
    `).join("");
}


// FACULTY SEARCH

function renderFaculty() {
    const search = ($("#facultySearch").value || "").toLowerCase();
    const department = $("#departmentFilter").value;

    const filtered = facultyMembers.filter((faculty) => {
        const text = (faculty.name + " " + faculty.title + " " + faculty.department).toLowerCase();

        return text.includes(search) &&
            (department === "all" || faculty.department === department);
    });

    $("#facultyCount").textContent =
        `${filtered.length} faculty ${filtered.length === 1 ? "member" : "members"} found`;

    $("#facultyList").innerHTML = filtered.length
        ? filtered.map((faculty) => `
            <article class="faculty-card">
                <div class="faculty-card-heading">
                    <span class="avatar ${faculty.color}">${initials(faculty.name)}</span>
                    <div class="person-info">
                        <strong>${escapeHTML(faculty.name)}</strong>
                        <small>${escapeHTML(faculty.title)}</small>
                    </div>
                    <button class="faculty-book" data-book="${escapeHTML(faculty.name)}"
                        aria-label="Book a consultation with ${escapeHTML(faculty.name)}">›</button>
                </div>

                <div class="faculty-meta">
                    <p><span aria-hidden="true">▦</span> Department of ${escapeHTML(faculty.department)}</p>
                    <p><span aria-hidden="true">⌖</span> ${escapeHTML(faculty.office)}</p>
                </div>
                <p class="faculty-description">${escapeHTML(faculty.description)}</p>
                <div class="faculty-availability">
                    <span aria-hidden="true">▢</span>
                    <span class="slot-badge">${faculty.slots} ${faculty.slots === 1 ? "slot" : "slots"} available</span>
                </div>
            </article>
        `).join("")
        : `<div class="empty">No faculty members found.</div>`;
}

$("#facultySearch").addEventListener("input", renderFaculty);
$("#departmentFilter").addEventListener("change", renderFaculty);


// APPOINTMENTS AND HISTORY

function renderAppointments() {
    let list = [...appointments].sort((a, b) =>
        b.date.localeCompare(a.date)
    );

    if (activeFilter !== "all") {
        list = list.filter((item) => item.status === activeFilter);
    }

    $("#appointmentsList").innerHTML = list.length
        ? list.map((item) => `
            <article class="appointment-card">
                <div class="appointment-card-heading">
                    <div class="person">
                        <span class="avatar appointment-avatar">${initials(item.faculty)}</span>
                        <div class="person-info">
                            <strong>${escapeHTML(item.faculty)}</strong>
                            <small>${escapeHTML(item.department)}</small>
                        </div>
                    </div>
                    ${badge(item.status)}
                </div>

                <div class="appointment-details">
                    <div class="appointment-detail">
                        <span aria-hidden="true">▦</span>
                        <span><small>Date</small><strong>${escapeHTML(prettyDate(item.date))}</strong></span>
                    </div>
                    <div class="appointment-detail">
                        <span aria-hidden="true">◷</span>
                        <span><small>Time</small><strong>${escapeHTML(item.time)}</strong></span>
                    </div>
                    <div class="appointment-detail location">
                        <span aria-hidden="true">⌖</span>
                        <span><small>Location</small><strong>${escapeHTML(item.location)}</strong></span>
                    </div>
                </div>

                <button class="small-button" data-details="${item.id}">
                    ${item.status === "Confirmed" ? "View Details & Check In" : "View Details"}
                </button>
            </article>
        `).join("")
        : `<div class="empty">No appointments in this category.</div>`;
}

$$("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
        activeFilter = button.dataset.filter;

        $$("[data-filter]").forEach((tab) => {
            tab.classList.toggle("active", tab === button);
        });

        renderAppointments();
    });
});

function renderHistory() {
    const search = $("#historySearch").value.trim().toLowerCase();
    const history = appointments.filter((item) =>
        item.status === "Completed" || item.status === "No Show"
    );
    const list = history
        .filter((item) => activeHistoryFilter === "all" || item.status === activeHistoryFilter)
        .filter((item) => (item.faculty + " " + item.department + " " + item.date + " " + item.time)
            .toLowerCase().includes(search))
        .sort((a, b) => b.date.localeCompare(a.date));

    $("#historyCount").textContent =
        `${history.length} total ${history.length === 1 ? "record" : "records"}`;

    $("#historyList").innerHTML = list.length
        ? `
            <table class="history-table">
                <thead>
                    <tr>
                        <th scope="col">Faculty</th>
                        <th scope="col">Date</th>
                        <th scope="col">Time</th>
                        <th scope="col">Status</th>
                        <th scope="col">Check-in</th>
                        <th scope="col"><span class="visually-hidden">Details</span></th>
                    </tr>
                </thead>
                <tbody>
                    ${list.map((item) => `
                        <tr>
                            <td>
                                <div class="history-faculty">
                                    <span class="avatar">${initials(item.faculty)}</span>
                                    <span>
                                        <strong>${escapeHTML(item.faculty)}</strong>
                                        <small>Department of ${escapeHTML(item.department)}</small>
                                    </span>
                                </div>
                            </td>
                            <td><span class="history-cell-icon" aria-hidden="true">▦</span>${escapeHTML(prettyDate(item.date))}</td>
                            <td><span class="history-cell-icon" aria-hidden="true">◷</span>${escapeHTML(item.time)}</td>
                            <td>${badge(item.status)}</td>
                            <td>
                                <span class="checkin-badge ${item.checkedIn ? "checked-in" : "not-checked-in"}">
                                    <span aria-hidden="true">●</span>${item.checkedIn ? "Checked In" : "Not Checked In"}
                                </span>
                            </td>
                            <td>
                                <button class="history-details" data-details="${item.id}"
                                    aria-label="View details for ${escapeHTML(item.faculty)}">View</button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `
        : `<div class="empty">No history records match your search.</div>`;
}

$("#historySearch").addEventListener("input", renderHistory);

$$("[data-history-filter]").forEach((button) => {
    button.addEventListener("click", () => {
        activeHistoryFilter = button.dataset.historyFilter;

        $$("[data-history-filter]").forEach((filter) => {
            filter.classList.toggle("active", filter === button);
        });

        renderHistory();
    });
});


// CREATE A BOOKING

document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-book]");
    if (!button) return;

    selectedFaculty = facultyMembers.find(
        (faculty) => faculty.name === button.dataset.book
    );

    if (!selectedFaculty) return;

    const today = new Date();
    const localToday = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0")
    ].join("-");

    openModal(`
        <h2>Book Consultation</h2>
        <p>Choose a date and time for ${escapeHTML(selectedFaculty.name)}.</p>

        <form id="bookingForm">
            <label for="bookingDate">Preferred Date</label>
            <input type="date" id="bookingDate" min="${localToday}" required>

            <label for="bookingTime">Preferred Time</label>
            <select id="bookingTime" required>
                <option value="">Select a time</option>
                <option>9:00 AM – 10:00 AM</option>
                <option>10:00 AM – 11:00 AM</option>
                <option>11:00 AM – 12:00 PM</option>
                <option>1:00 PM – 2:00 PM</option>
                <option>2:00 PM – 3:00 PM</option>
            </select>

            <label for="bookingReason">Reason for Consultation</label>
            <input id="bookingReason" placeholder="e.g. Project consultation" required>

            <button class="primary-button" type="submit">Submit Appointment</button>
        </form>
    `);
});

document.addEventListener("submit", (event) => {
    if (event.target.id !== "bookingForm") return;

    event.preventDefault();

    const date = $("#bookingDate").value;
    const time = $("#bookingTime").value;
    const reason = $("#bookingReason").value.trim();

    if (!selectedFaculty || !date || !time || !reason) return;

    const duplicate = appointments.some((item) =>
        item.faculty === selectedFaculty.name &&
        item.date === date &&
        item.time === time &&
        item.status === "Confirmed"
    );

    if (duplicate) {
        showToast("You already have this appointment.");
        return;
    }

    appointments.push({
        id: Date.now(),
        faculty: selectedFaculty.name,
        department: selectedFaculty.department,
        date,
        time,
        location: selectedFaculty.office,
        status: "Confirmed",
        reason
    });

    closeModal();
    showPage("appointments");
    showToast("Demo appointment created.");
});


// VIEW DETAILS AND CHECK IN

document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-details]");
    if (!button) return;

    const item = appointments.find(
        (appointment) => appointment.id === Number(button.dataset.details)
    );

    if (!item) return;

    openModal(`
        <h2>${escapeHTML(item.faculty)}</h2>
        <p>${escapeHTML(item.department)}</p>

        <div class="details">
            <div>▦ &nbsp; ${escapeHTML(prettyDate(item.date))}</div>
            <div>◷ &nbsp; ${escapeHTML(item.time)}</div>
            <div>⌖ &nbsp; ${escapeHTML(item.location)}</div>
            <div>Status: ${badge(item.status)}</div>
            ${item.reason ? `<div>Reason: ${escapeHTML(item.reason)}</div>` : ""}
        </div>

        ${item.status === "Confirmed" ? `
            <button class="primary-button" data-checkin="${item.id}">
                Check In
            </button>
        ` : ""}

        <button class="small-button" id="closeDetails">Close</button>
    `);

    $("#closeDetails").addEventListener("click", closeModal);
});

document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-checkin]");
    if (!button) return;

    const item = appointments.find(
        (appointment) => appointment.id === Number(button.dataset.checkin)
    );

    if (!item) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appointmentDate = new Date(item.date + "T12:00:00");

    if (appointmentDate > today) {
        showToast("Check-in is available on the appointment date.");
        return;
    }

    item.checkedIn = true;

    closeModal();
    renderDashboard();
    showToast("Check-in recorded in the demo.");
});


// INITIALIZE

renderDashboard();