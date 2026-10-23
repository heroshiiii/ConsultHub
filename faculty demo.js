const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const today = new Date();
const localDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
const dateLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const appointments = [
    { name: "Andrea Reyes", time: "10:00 AM – 11:00 AM", checked: true, initials: "AR" },
    { name: "Carlo Mendoza", time: "10:00 AM – 11:00 AM", checked: false, initials: "CM" },
    { name: "Sofia Villanueva", time: "10:00 AM – 11:00 AM", checked: true, initials: "SV" },
    { name: "Marco Tan", time: "2:00 PM – 3:00 PM", checked: false, initials: "MT" }
];
let slots = [
    { date: localDate, start: "10:00 AM", end: "11:00 AM", capacity: 5, booked: 3 },
    { date: localDate, start: "11:00 AM", end: "12:00 PM", capacity: 5, booked: 5 }
];
let toastTimer;

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function timeLabel(value) {
    const [hourText, minute] = value.split(":");
    const hour = Number(hourText);
    return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

function slotDateLabel(date) {
    return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function showPage(id) {
    $$(".page-view").forEach((page) => page.classList.toggle("hidden", page.id !== id));
    $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === id));
    if (id === "availability") renderAvailability();
    if (id === "schedule") renderSchedule();
    if (id === "appointments") renderAppointments();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function scheduleCard(slot, index) {
    const percent = Math.min(100, Math.round(slot.booked / slot.capacity * 100));
    return `<article class="schedule-card">
        <strong>${escapeHTML(slot.start)} – ${escapeHTML(slot.end)}</strong>
        <small class="count">${slot.booked}/${slot.capacity}<br><small>students</small></small>
        <small>${escapeHTML(slotDateLabel(slot.date))}</small>
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
    $("#dayName").textContent = today.toLocaleDateString("en-US", { weekday: "long" });
    $("#currentDate").textContent = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    $("#todayCount").textContent = slots.length;
    $("#upcomingCount").textContent = appointments.length;
    $("#checkedCount").textContent = appointments.filter((student) => student.checked).length;
    $("#schedulePreview").innerHTML = slots.slice(0, 2).map(scheduleCard).join("");
    $("#studentPreview").innerHTML = appointments.slice(0, 4).map(studentCard).join("");
}

function renderAvailability() {
    $("#availabilityList").innerHTML = slots.length
        ? slots.map((slot, index) => `<article class="appointment-card"><span class="student-info"><strong>${escapeHTML(slot.start)} – ${escapeHTML(slot.end)}</strong><small>${escapeHTML(slotDateLabel(slot.date))} · ${slot.booked}/${slot.capacity} students booked</small></span><button class="remove-button" data-remove-slot="${index}">Remove</button></article>`).join("")
        : `<p class="panel">No availability slots yet. Add one above to let students book.</p>`;
}

function renderSchedule() {
    $("#fullSchedule").innerHTML = slots.map(scheduleCard).join("");
}

function renderAppointments() {
    const search = $("#studentSearch").value.trim().toLowerCase();
    const filter = $("#attendanceFilter").value;
    const filtered = appointments.filter((student) => student.name.toLowerCase().includes(search) &&
        (filter === "all" || (student.checked ? "Checked In" : "Not Checked In") === filter));
    $("#appointmentsList").innerHTML = filtered.length
        ? filtered.map((student) => {
            const index = appointments.indexOf(student);
            return `<article class="appointment-card"><span class="initials">${escapeHTML(student.initials)}</span><span class="student-info"><strong>${escapeHTML(student.name)}</strong><small>${escapeHTML(student.time)} · ${dateLabel}</small></span><span class="badge ${student.checked ? "" : "pending"}">${student.checked ? "● Checked In" : "● Not Checked In"}</span><button data-toggle-checkin="${index}">${student.checked ? "Undo check-in" : "Mark present"}</button></article>`;
        }).join("")
        : `<p class="panel">No appointments match your search.</p>`;
}

$("#slotDate").min = localDate;
$("#slotDate").value = localDate;
$("#slotDate").addEventListener("change", (event) => {
    const chosen = new Date(`${event.target.value}T12:00:00`);
    if (!Number.isNaN(chosen.getTime())) {
        const updated = chosen.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        $("#availabilityList").dataset.date = updated;
    }
});

$$("[data-view]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.view)));
$$("[data-go]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.go)));
$("#availabilityForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const start = $("#slotStart").value;
    const end = $("#slotEnd").value;
    const date = $("#slotDate").value;
    const capacity = Number($("#slotCapacity").value);
    if (!date || !start || !end || start >= end || capacity < 1) {
        showToast("Enter a valid date, time range, and capacity.");
        return;
    }
    slots.push({ date, start: timeLabel(start), end: timeLabel(end), capacity, booked: 0 });
    slots.sort((a, b) => a.start.localeCompare(b.start));
    event.target.reset();
    $("#slotDate").value = localDate;
    $("#slotCapacity").value = "5";
    renderAvailability();
    renderDashboard();
    showToast("Availability slot added.");
});

document.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-slot]");
    if (remove) {
        slots.splice(Number(remove.dataset.removeSlot), 1);
        renderAvailability();
        renderDashboard();
        return;
    }
    const checkin = event.target.closest("[data-toggle-checkin]");
    if (checkin) {
        const student = appointments[Number(checkin.dataset.toggleCheckin)];
        student.checked = !student.checked;
        renderAppointments();
        renderDashboard();
        showToast(student.checked ? "Student marked present." : "Check-in undone.");
    }
});
$("#studentSearch").addEventListener("input", renderAppointments);
$("#attendanceFilter").addEventListener("change", renderAppointments);

renderDashboard();
