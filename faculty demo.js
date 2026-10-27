const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const today = new Date();
const localDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
const scheduleWeekStart = new Date(today);
scheduleWeekStart.setDate(today.getDate() + (today.getDay() === 0 ? 1 : today.getDay() === 6 ? 2 : 1 - today.getDay()));
scheduleWeekStart.setHours(12, 0, 0, 0);
let appointments = [];
let facultyId = null;
let currentFaculty = null;
let displayedWeekStart = new Date(scheduleWeekStart);
let selectedScheduleDate = null;
let activeAppointmentFilter = "all";
let slots = [];
let toastTimer;
let editingSlotId = null;

function dateOffset(startDate, offset) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + offset);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function statusClass(status) {
    return String(status).toLowerCase().replace(/\s+/g, "-");
}

function timeLabel(value) {
    const [hourText, minute] = value.split(":");
    const hour = Number(hourText);
    return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

function timeValue(value) {
    const match = value.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/);
    if (!match) return "";

    let hour = Number(match[1]) % 12;
    if (match[3] === "PM") hour += 12;
    return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function slotDateLabel(date) {
    return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function displayName(name) {
    return String(name || "").trim();
}

function initials(name) {
    return displayName(name).replace(/^(Dr\.|Prof\.)\s*/i, "")
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

function shortDateLabel(date) {
    return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

async function refreshFacultyAppointments() {
    try {
        const [appointmentData, slotData] = await Promise.all([
            api.get("appointments"),
            api.get(`slots?facultyId=${encodeURIComponent(facultyId)}`)
        ]);
        appointments = appointmentData.map((item) => ({
            ...item,
            name: item.student || item.studentName || "Student",
            studentId: item.studentNumber || item.studentId || "",
            program: item.program || "",
            checked: Boolean(item.checkedIn),
            initials: initials(item.student || item.studentName || "Student")
        }));
        slots = slotData.map((slot) => ({
            ...slot,
            booked: appointments.filter((item) => item.slotId === slot.id && item.status === "Confirmed").length
        }));
        renderAppointments();
        renderSchedule();
        renderDashboard();
    } catch (error) {
        showToast(`Could not refresh appointments: ${error.message}`);
    }
}

function showPage(id) {
    $$(".page-view").forEach((page) => page.classList.toggle("hidden", page.id !== id));
    $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === id));
    if (id === "availability") renderAvailability();
    if (id === "schedule") renderSchedule();
    if (id === "appointments") renderAppointments();
    if ((id === "appointments" || id === "schedule") && facultyId) refreshFacultyAppointments();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function scheduleCard(slot, index) {
    const percent = Math.min(100, Math.round(slot.booked / slot.capacity * 100));
    return `<article class="schedule-card">
        <strong>${escapeHTML(slot.start)} – ${escapeHTML(slot.end)}</strong>
        <small class="count">${slot.booked}/${slot.capacity}<br><small>students</small></small>
        <small>${escapeHTML(slotDateLabel(slot.date))}</small>
        <small>⌖ ${escapeHTML(slot.location || "Room to be confirmed")}</small>
        <small class="checked">${slot.capacity - slot.booked} spots available</small>
        <div class="progress"><span style="width:${percent}%"></span></div>
        ${index === 0 ? `<small class="checked">${appointments.filter((student) => student.checked).length} checked in</small>` : `<small></small>`}
    </article>`;
}

function studentCard(student) {
    return `<article class="student-card"><span class="initials">${escapeHTML(student.initials)}</span>
        <div class="student-info"><strong>${escapeHTML(student.name)}</strong><small>${escapeHTML(student.time)}</small></div>
        <span class="badge ${student.checked ? "" : "pending"}">${student.checked ? "● Checked In" : "● Not Checked In"}</span>
    </article>`;
}

function renderDashboard() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    $("#facultyGreeting").textContent = `${greeting}, ${currentFaculty?.name || "Faculty"}`;
    $("#dayName").textContent = today.toLocaleDateString("en-US", { weekday: "long" });
    $("#currentDate").textContent = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    $("#todayCount").textContent = slots.length;
    $("#upcomingCount").textContent = appointments.length;
    $("#checkedCount").textContent = appointments.filter((student) => student.checked).length;
    $("#schedulePreview").innerHTML = slots.slice(0, 2).map(scheduleCard).join("");
    $("#studentPreview").innerHTML = appointments.slice(0, 4).map(studentCard).join("");
}

function renderAvailability() {
    const sortedSlots = [...slots].sort((a, b) =>
        a.date.localeCompare(b.date) || timeValue(a.start).localeCompare(timeValue(b.start))
    );
    $("#availabilityCount").textContent =
        `${sortedSlots.length} ${sortedSlots.length === 1 ? "slot" : "slots"} configured`;

    $("#availabilityList").innerHTML = sortedSlots.length
        ? sortedSlots.map((slot) => {
            const percent = Math.min(100, Math.round(slot.booked / slot.capacity * 100));
            const full = slot.booked >= slot.capacity;
            return `<article class="availability-card">
                <div class="availability-card-top">
                    <div class="availability-slot-info">
                        <strong><span aria-hidden="true">▦</span> ${escapeHTML(slotDateLabel(slot.date))}</strong>
                        <div class="availability-slot-meta">
                            <span><span aria-hidden="true">◷</span> ${escapeHTML(slot.start)} – ${escapeHTML(slot.end)}</span>
                            <span><span aria-hidden="true">⌖</span> ${escapeHTML(slot.location || "Room to be confirmed")}</span>
                            <span><span aria-hidden="true">♙</span> ${slot.capacity} students max</span>
                        </div>
                    </div>
                    <div class="availability-actions">
                        <button class="slot-action edit" type="button" data-edit-slot="${slot.id}"
                            aria-label="Edit slot on ${escapeHTML(slotDateLabel(slot.date))}">✎</button>
                        <button class="slot-action delete" type="button" data-delete-slot="${slot.id}"
                            aria-label="Delete slot on ${escapeHTML(slotDateLabel(slot.date))}">⌫</button>
                    </div>
                </div>
                <div class="availability-progress-row">
                    <div class="availability-progress ${full ? "full" : ""}" role="progressbar"
                        aria-label="Booked seats" aria-valuemin="0" aria-valuemax="${slot.capacity}"
                        aria-valuenow="${slot.booked}">
                        <span style="width:${percent}%"></span>
                    </div>
                    <span class="reservation-count">${slot.booked}/${slot.capacity} reserved</span>
                    ${full ? `<span class="full-badge">Full</span>` : ""}
                </div>
            </article>`;
        }).join("")
        : `<p class="empty-state">No availability slots yet. Add a slot to let students book.</p>`;
}

function renderSchedule() {
    const weekDates = Array.from({ length: 5 }, (_, index) => dateOffset(displayedWeekStart, index));
    const visibleSlots = slots
        .filter((slot) => weekDates.includes(slot.date))
        .sort((a, b) => a.date.localeCompare(b.date) || timeValue(a.start).localeCompare(timeValue(b.start)));
    const rangeStart = new Date(`${weekDates[0]}T12:00:00`);
    const rangeEnd = new Date(`${weekDates[4]}T12:00:00`);
    const dateFormat = { month: "short", day: "numeric" };
    const rangeText = `${rangeStart.toLocaleDateString("en-US", dateFormat)} – ${rangeEnd.toLocaleDateString("en-US", { ...dateFormat, year: "numeric" })}`;

    $("#scheduleWeekLabel").textContent = rangeText;
    $("#scheduleSlotCount").textContent = `${visibleSlots.length} total ${visibleSlots.length === 1 ? "slot" : "slots"}`;

    if (!selectedScheduleDate || !weekDates.includes(selectedScheduleDate)) {
        selectedScheduleDate = visibleSlots.length ? visibleSlots[0].date : weekDates[0];
    }

    $("#scheduleWeek").innerHTML = weekDates.map((date) => {
        const daySlots = visibleSlots.filter((slot) => slot.date === date);
        const dateObject = new Date(`${date}T12:00:00`);
        const weekday = dateObject.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
        return `<button class="schedule-day ${date === selectedScheduleDate ? "selected" : ""}"
            type="button" data-schedule-date="${date}" aria-pressed="${date === selectedScheduleDate}">
            <span class="schedule-day-name">${weekday}</span>
            <strong>${dateObject.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong>
            <span class="schedule-day-slots">
                ${daySlots.length
                    ? daySlots.map((slot) => `<span class="schedule-day-slot ${slot.booked >= slot.capacity ? "full" : ""}">
                        <strong>${escapeHTML(slot.start)}</strong>
                        <small>${escapeHTML(slot.location || "Room to be confirmed")}</small>
                        <small>${slot.booked}/${slot.capacity} students</small>
                    </span>`).join("")
                    : `<span class="no-day-slots">No slots</span>`}
            </span>
        </button>`;
    }).join("");

    $("#fullSchedule").innerHTML = visibleSlots.length
        ? weekDates.filter((date) => visibleSlots.some((slot) => slot.date === date)).map((date) => {
            const dateSlots = visibleSlots.filter((slot) => slot.date === date);
            return `<section class="schedule-date-group" id="schedule-date-${date}">
                <h3><span aria-hidden="true">▦</span> ${escapeHTML(slotDateLabel(date))}</h3>
                <div class="schedule-slot-list">
                    ${dateSlots.map((slot) => {
                        const percent = Math.min(100, Math.round(slot.booked / slot.capacity * 100));
                        const full = slot.booked >= slot.capacity;
                        const checkedIn = appointments.filter((student) => student.slotId === slot.id && student.checked).length;
                        const spotsLeft = slot.capacity - slot.booked;
                        return `<article class="schedule-slot-row">
                            <span class="schedule-slot-time"><span aria-hidden="true">◷</span>${escapeHTML(slot.start)} – ${escapeHTML(slot.end)}</span>
                            <span class="schedule-slot-location"><span aria-hidden="true">⌖</span>${escapeHTML(slot.location || "Room to be confirmed")}</span>
                            <span class="schedule-reserved"><span aria-hidden="true">♙</span>${slot.booked}/${slot.capacity} reserved</span>
                            ${full
                                ? `<span class="schedule-full-badge">Full</span>`
                                : `<span class="schedule-open-badge">${spotsLeft} ${spotsLeft === 1 ? "slot" : "slots"} left</span>`}
                            <span class="schedule-checked-in">${checkedIn} checked in</span>
                            <span class="schedule-row-progress ${full ? "full" : ""}" role="progressbar"
                                aria-label="Booked seats" aria-valuemin="0" aria-valuemax="${slot.capacity}"
                                aria-valuenow="${slot.booked}"><span style="width:${percent}%"></span></span>
                            <button class="view-students-button" type="button" data-show-slot-students="${slot.id}">View students →</button>
                        </article>`;
                    }).join("")}
                </div>
            </section>`;
        }).join("")
        : `<p class="schedule-empty">No consultation slots scheduled this week.</p>`;
}

let appointmentSlotFilter = null;

function renderAppointments() {
    const search = $("#studentSearch").value.trim().toLowerCase();
    const relevantAppointments = appointments.filter((student) =>
        appointmentSlotFilter === null || student.slotId === appointmentSlotFilter
    );
    const checkedCount = relevantAppointments.filter((student) => student.checked).length;
    const noShowCount = relevantAppointments.filter((student) => student.status === "No Show").length;
    $("#appointmentTotal").textContent = relevantAppointments.length;
    $("#appointmentChecked").textContent = checkedCount;
    $("#appointmentNotChecked").textContent = relevantAppointments.filter((student) => !student.checked && student.status !== "No Show").length;
    $("#appointmentNoShow").textContent = noShowCount;

    const filtered = appointments.filter((student) =>
        (appointmentSlotFilter === null || student.slotId === appointmentSlotFilter) &&
        `${student.name} ${student.studentId} ${student.program}`.toLowerCase().includes(search) &&
        (activeAppointmentFilter === "all" ||
            (activeAppointmentFilter === "checked" && student.checked) ||
            (activeAppointmentFilter === "not-checked" && !student.checked && student.status !== "No Show")));

    const grouped = filtered.reduce((groups, student) => {
        (groups[student.date] ||= []).push(student);
        return groups;
    }, {});
    const dates = Object.keys(grouped).sort();

    $("#appointmentsList").innerHTML = dates.length
        ? dates.map((date) => {
            const dayAppointments = grouped[date];
            const checkedIn = dayAppointments.filter((student) => student.checked).length;
            const dateObject = new Date(`${date}T12:00:00`);
            const dayBadge = dateObject.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
            const dayNumber = dateObject.toLocaleDateString("en-US", { day: "numeric" });
            return `<section class="appointment-date-group">
                <header class="appointment-date-heading">
                    <span class="appointment-date-icon"><small>${dayBadge}</small><strong>${dayNumber}</strong></span>
                    <span class="appointment-date-title">
                        <strong>${escapeHTML(slotDateLabel(date))}</strong>
                        <small>${dayAppointments.length} ${dayAppointments.length === 1 ? "appointment" : "appointments"}</small>
                    </span>
                    <span class="date-checkin-summary">♙ &nbsp;${checkedIn} checked in</span>
                </header>
                <div class="appointment-student-list">
                    ${dayAppointments.map((student) => {
                        const index = appointments.indexOf(student);
                        return `<article class="appointment-student-row">
                            <span class="appointment-student-avatar">${escapeHTML(student.initials)}</span>
                            <span class="appointment-student-info">
                                <strong>${escapeHTML(student.name)}</strong>
                                ${[student.studentId, student.program].filter(Boolean).length
                                    ? `<small>${escapeHTML([student.studentId, student.program].filter(Boolean).join(" · "))}</small>`
                                    : ""}
                            </span>
                            <span class="appointment-time"><span aria-hidden="true">◷</span>${escapeHTML(student.time)}</span>
                            <span class="appointment-status ${statusClass(student.status)}">${escapeHTML(student.status)}</span>
                            <button class="checkin-status ${student.checked ? "checked" : "not-checked"}"
                                type="button" data-toggle-checkin="${index}"
                                aria-label="${student.checked ? "Undo check-in for" : "Mark present"} ${escapeHTML(student.name)}">
                                <span aria-hidden="true">●</span>${student.checked ? "Checked In" : "Not Checked In"}
                            </button>
                            ${student.checkedAt ? `<span class="checked-at">${escapeHTML(student.checkedAt)}</span>` : ""}
                            <span class="row-chevron" aria-hidden="true">›</span>
                        </article>`;
                    }).join("")}
                </div>
            </section>`;
        }).join("")
        : `<p class="appointments-empty">No appointments match your search or filter.</p>`;
}

$("#slotDate").min = localDate;
$("#slotDate").addEventListener("change", (event) => {
    const chosen = new Date(`${event.target.value}T12:00:00`);
    if (!Number.isNaN(chosen.getTime())) {
        const updated = chosen.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        $("#availabilityList").dataset.date = updated;
    }
});

$$("[data-view]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.view === "appointments") appointmentSlotFilter = null;
    showPage(button.dataset.view);
}));
$$("[data-go]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.go)));
$$("[data-appointment-filter]").forEach((button) => button.addEventListener("click", () => {
    activeAppointmentFilter = button.dataset.appointmentFilter;
    $$("[data-appointment-filter]").forEach((filterButton) => {
        filterButton.classList.toggle("active", filterButton === button);
    });
    renderAppointments();
}));

$$("[data-week-shift]").forEach((button) => button.addEventListener("click", () => {
    displayedWeekStart.setDate(displayedWeekStart.getDate() + Number(button.dataset.weekShift) * 7);
    selectedScheduleDate = null;
    renderSchedule();
}));

$("#scheduleWeek").addEventListener("click", (event) => {
    const dayButton = event.target.closest("[data-schedule-date]");
    if (!dayButton) return;

    selectedScheduleDate = dayButton.dataset.scheduleDate;
    renderSchedule();
    document.querySelector(`#schedule-date-${selectedScheduleDate}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
});

$("#fullSchedule").addEventListener("click", (event) => {
    const studentsButton = event.target.closest("[data-show-slot-students]");
    if (!studentsButton) return;

    appointmentSlotFilter = studentsButton.dataset.showSlotStudents;
    showPage("appointments");
});
function openSlotForm(slot = null) {
    editingSlotId = slot ? slot.id : null;
    $("#slotFormTitle").textContent = slot ? "Edit availability slot" : "Add availability slot";
    $("#saveSlot").textContent = slot ? "Save Changes" : "Add Slot";
    $("#slotDate").value = slot?.date || dateOffset(scheduleWeekStart, 0);
    $("#slotStart").value = slot ? timeValue(slot.start) : "";
    $("#slotEnd").value = slot ? timeValue(slot.end) : "";
    $("#slotLocation").value = slot?.location || currentFaculty?.office || "";
    $("#slotCapacity").value = slot?.capacity || 5;
    $("#slotFormMessage").textContent = "";
    $("#availabilityForm").classList.remove("hidden");
    $("#toggleSlotForm").setAttribute("aria-expanded", "true");
    $("#slotDate").focus();
}

function closeSlotForm() {
    $("#availabilityForm").classList.add("hidden");
    $("#availabilityForm").reset();
    $("#slotDate").value = dateOffset(scheduleWeekStart, 0);
    $("#slotCapacity").value = "5";
    $("#slotLocation").value = "";
    $("#slotFormMessage").textContent = "";
    $("#toggleSlotForm").setAttribute("aria-expanded", "false");
    editingSlotId = null;
}

$("#toggleSlotForm").addEventListener("click", () => {
    if ($("#availabilityForm").classList.contains("hidden")) {
        openSlotForm();
    } else {
        closeSlotForm();
    }
});

$("#cancelSlotForm").addEventListener("click", closeSlotForm);

$("#availabilityForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const start = $("#slotStart").value;
    const end = $("#slotEnd").value;
    const date = $("#slotDate").value;
    const location = $("#slotLocation").value.trim();
    const capacity = Number($("#slotCapacity").value);
    const existing = slots.find((slot) => slot.id === editingSlotId);
    const message = $("#slotFormMessage");

    if (!date || !start || !end || !location || start >= end || !Number.isInteger(capacity) ||
        capacity < 1 || capacity > 20 || (existing && capacity < existing.booked)) {
        message.textContent = existing && capacity < existing.booked
            ? `Capacity cannot be lower than the ${existing.booked} existing reservations.`
            : "Enter a room, date, valid time range, and capacity from 1 to 20.";
        return;
    }

    const duplicate = slots.some((slot) =>
        slot.id !== editingSlotId && slot.date === date && timeValue(slot.start) === start
    );
    if (duplicate) {
        message.textContent = "A slot already exists at this date and start time.";
        return;
    }

    try {
        const payload = {
            facultyId,
            date,
            start: timeLabel(start),
            end: timeLabel(end),
            location,
            capacity
        };
        if (existing) {
            Object.assign(existing, await api.update(`slots/${existing.id}`, payload));
        } else {
            slots.push({ ...await api.create("slots", payload), booked: 0 });
        }
    } catch (error) {
        message.textContent = error.message;
        return;
    }

    closeSlotForm();
    renderAvailability();
    renderDashboard();
    showToast(existing ? "Availability slot updated." : "Availability slot added.");
});

document.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-slot]");
    if (editButton) {
        const slot = slots.find((item) => item.id === editButton.dataset.editSlot);
        if (slot) openSlotForm(slot);
        return;
    }

    const deleteButton = event.target.closest("[data-delete-slot]");
    if (deleteButton) {
        const slot = slots.find((item) => item.id === deleteButton.dataset.deleteSlot);
        if (!slot) return;
        if (slot.booked > 0) {
            showToast("Slots with existing reservations cannot be deleted.");
            return;
        }
        try {
            await api.remove(`slots/${slot.id}`);
            slots = slots.filter((item) => item.id !== slot.id);
        } catch (error) {
            showToast(error.message);
            return;
        }
        renderAvailability();
        renderDashboard();
        showToast("Availability slot deleted.");
        return;
    }
    const checkin = event.target.closest("[data-toggle-checkin]");
    if (checkin) {
        const student = appointments[Number(checkin.dataset.toggleCheckin)];
        if (!student) return;
        try {
            Object.assign(student, await api.update(`appointments/${student.id}`, {
                checkedIn: !student.checked,
                checkedAt: !student.checked
                    ? new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                    : ""
            }));
        } catch (error) {
            showToast(error.message);
            return;
        }
        renderAppointments();
        renderDashboard();
        showToast(student.checked ? "Student marked present." : "Check-in undone.");
    }
});
$("#studentSearch").addEventListener("input", renderAppointments);

async function initializeFacultyPage() {
    try {
        const user = await api.get("auth/me");
        if (user.role !== "Faculty" || !user.facultyId) {
            throw new Error("An active faculty profile is required to view this dashboard.");
        }
        currentFaculty = user;
        facultyId = currentFaculty.facultyId;
        $("#facultyNameDisplay").textContent = currentFaculty.name;
        $("#facultyAvatar").textContent = initials(currentFaculty.name);
        await refreshFacultyAppointments();
    } catch (error) {
        showToast(`Could not load ConsultHub data: ${error.message}`);
    }
}

initializeFacultyPage();
