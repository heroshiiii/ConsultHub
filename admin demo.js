const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let accountData = [];
let facultyData = [];
let studentData = [];
let consultationData = [];

let toastTimer;
let editingFacultyIndex = null;
let systemPolicies = {
    checkinWindow: 20,
    defaultCapacity: 5,
    automaticNoShow: true,
    automaticCompletion: true
};

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
    $("#accountCount").textContent = accountData.filter((account) => account.status === "Active").length;
    $("#consultationCount").textContent = consultationData.length;
    $("#completedCount").textContent = consultationData.filter((item) => item.status === "Completed").length;
    $("#missedCount").textContent = consultationData.filter((item) => item.status === "No Show").length;
}

function renderAccounts() {
    const query = $("#accountSearch").value.trim().toLowerCase();
    const filteredAccounts = accountData.filter((account) =>
        `${account.name} ${account.email} ${account.role} ${account.status}`.toLowerCase().includes(query)
    );

    $("#accountsList").innerHTML = filteredAccounts.length
        ? filteredAccounts.map((account) => {
            const index = accountData.indexOf(account);
            const isAdministrator = account.role === "Administrator";
            return `<article class="account-row">
                <span class="account-avatar">${escapeHTML(initials(account.name))}</span>
                <span class="account-identity">
                    <strong>${escapeHTML(account.name)}</strong>
                    <small>${escapeHTML(account.email)}</small>
                </span>
                <span class="account-role">${escapeHTML(isAdministrator ? "Admin" : account.role)}</span>
                <span class="account-status ${account.status === "Active" ? "active" : "suspended"}"><span aria-hidden="true"></span>${escapeHTML(account.status)}</span>
                ${isAdministrator
                    ? ""
                    : `<button class="account-action" type="button" data-account-toggle="${index}" aria-label="${account.status === "Active" ? "Suspend" : "Reactivate"} ${escapeHTML(account.name)}">${account.status === "Active" ? "Suspend" : "Reactivate"}</button>`}
            </article>`;
        }).join("")
        : `<p class="account-empty">No accounts match your search.</p>`;
}

function renderFacultyOverview() {
    const query = $("#facultySearch").value.trim().toLowerCase();
    const filteredFaculty = facultyData.filter((faculty) =>
        `${faculty.name} ${faculty.title} ${faculty.email} ${faculty.department} ${faculty.office}`.toLowerCase().includes(query)
    );

    $("#facultyOverview").innerHTML = filteredFaculty.length
        ? filteredFaculty.map((faculty) => {
            const index = facultyData.indexOf(faculty);
            return `<article class="faculty-card">
                <span class="faculty-card-avatar">${escapeHTML(initials(faculty.name.replace(/^(Dr\.|Prof\.)\s*/, "")))}</span>
                <div class="faculty-card-info">
                    <strong>${escapeHTML(faculty.name)}</strong>
                    <small class="faculty-card-title">${escapeHTML(faculty.title)}</small>
                    <small>${escapeHTML(faculty.department.startsWith("Department of ") ? faculty.department : `Department of ${faculty.department}`)}</small>
                    <small>${escapeHTML(faculty.office)}</small>
                </div>
                <button class="faculty-menu-button" type="button" data-edit-faculty="${index}" aria-label="Edit ${escapeHTML(faculty.name)}" title="Edit faculty profile">⋯</button>
            </article>`;
        }).join("")
        : `<p class="account-empty">No faculty match your search.</p>`;
}

function renderStudents() {
    const query = $("#studentSearch").value.trim().toLowerCase();
    const filteredStudents = studentData.filter((student) =>
        `${student.name} ${student.email} ${student.studentNumber} ${student.program} ${student.year} ${student.section}`.toLowerCase().includes(query)
    );

    $("#studentsList").innerHTML = filteredStudents.length
        ? filteredStudents.map((student) => {
            const index = studentData.indexOf(student);
            return `<tr>
                <td class="student-name-cell"><strong>${escapeHTML(student.name)}</strong><small>${escapeHTML(student.email)}</small></td>
                <td>${escapeHTML(student.studentNumber)}</td>
                <td>${escapeHTML(student.program)}</td>
                <td>${escapeHTML(student.year)} · ${escapeHTML(student.section)}</td>
                <td><button class="student-edit-button" type="button" data-edit-student="${index}" aria-label="Edit ${escapeHTML(student.name)}">Edit</button></td>
            </tr>`;
        }).join("")
        : `<tr><td class="student-empty" colspan="5">No students match your search.</td></tr>`;
}

function renderSystem() {
    $("#checkinWindow").value = systemPolicies.checkinWindow;
    $("#defaultCapacity").value = systemPolicies.defaultCapacity;
    $("#automaticNoShow").checked = systemPolicies.automaticNoShow;
    $("#automaticCompletion").checked = systemPolicies.automaticCompletion;
    updatePolicyStates();
}

function updatePolicyStates() {
    $$("[data-enabled-for]").forEach((state) => {
        const enabled = $(`#${state.dataset.enabledFor}`).checked;
        state.textContent = enabled ? "Enabled" : "Disabled";
        state.classList.toggle("disabled", !enabled);
    });
}

function renderRecords() {
    const query = $("#recordSearch").value.trim().toLowerCase();
    const filteredRecords = consultationData.filter((record) =>
        `${record.student} ${record.studentNumber} ${record.faculty} ${record.date} ${record.time} ${record.checkedIn ? "checked in" : "not checked in"} ${record.status}`.toLowerCase().includes(query)
    );
    $("#recordsList").innerHTML = filteredRecords.length
        ? filteredRecords.map((record) => `
            <tr>
                <td class="record-student-cell"><strong>${escapeHTML(record.student)}</strong><small>${escapeHTML(record.studentNumber)}</small></td>
                <td>${escapeHTML(record.faculty)}</td>
                <td class="record-schedule-cell"><strong>${escapeHTML(new Date(`${record.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}</strong><small>${escapeHTML(record.time)}</small></td>
                <td><span class="record-checkin ${record.checkedIn ? "checked" : "not-checked"}">${record.checkedIn ? "Checked In" : "Not Checked In"}</span></td>
                <td><span class="record-status ${statusClass(record.status)}">${escapeHTML(record.status)}</span></td>
            </tr>
        `).join("")
        : `<tr><td class="records-empty" colspan="5">No consultation records match your search.</td></tr>`;
}
$$(".nav-link").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.view));
});

$$("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.go));
});

$("#accountSearch").addEventListener("input", renderAccounts);
$("#addAccountButton").addEventListener("click", () => $("#accountDialog").showModal());
$("#closeAccountDialog").addEventListener("click", () => $("#accountDialog").close());
$("#cancelAccountDialog").addEventListener("click", () => $("#accountDialog").close());
$("#accountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#accountName").value.trim();
    const email = $("#accountEmail").value.trim();
    const role = $("#accountRole").value;
    if (accountData.some((account) => account.email.toLowerCase() === email.toLowerCase())) {
        showToast("An account with this email already exists.");
        $("#accountEmail").focus();
        return;
    }

    try {
        accountData.push(await api.create("accounts", { name, email, role }));
        $("#accountForm").reset();
        $("#accountDialog").close();
        renderAccounts();
        renderOverview();
        showToast("Account added.");
    } catch (error) {
        showToast(error.message);
    }
});
$("#accountsList").addEventListener("click", async (event) => {
    const toggle = event.target.closest("[data-account-toggle]");
    if (!toggle) return;
    const account = accountData[Number(toggle.dataset.accountToggle)];
    if (!account || account.role === "Administrator") return;
    try {
        const status = account.status === "Active" ? "Suspended" : "Active";
        Object.assign(account, await api.update(`accounts/${account.id}`, { status }));
        renderAccounts();
        renderOverview();
        showToast(`${account.name} ${account.status.toLowerCase()}.`);
    } catch (error) {
        showToast(error.message);
    }
});

function openFacultyDialog(index = null) {
    editingFacultyIndex = index;
    const faculty = index === null ? null : facultyData[index];
    $("#facultyForm").reset();
    $("#facultyDialogTitle").textContent = faculty ? "Edit faculty" : "Add faculty";
    $("#saveFacultyButton").textContent = faculty ? "Save changes" : "Add faculty";
    $("#facultyName").value = faculty?.name || "";
    $("#facultyTitle").value = faculty?.title || "";
    $("#facultyEmail").value = faculty?.email || "";
    $("#facultyDepartment").value = faculty?.department.replace(/^Department of /, "") || "";
    $("#facultyOffice").value = faculty?.office || "";
    $("#facultyDialog").showModal();
}

$("#facultySearch").addEventListener("input", renderFacultyOverview);
$("#addFacultyButton").addEventListener("click", () => openFacultyDialog());
$("#closeFacultyDialog").addEventListener("click", () => $("#facultyDialog").close());
$("#cancelFacultyDialog").addEventListener("click", () => $("#facultyDialog").close());
$("#facultyOverview").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-faculty]");
    if (editButton) openFacultyDialog(Number(editButton.dataset.editFaculty));
});
$("#facultyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const faculty = {
        name: $("#facultyName").value.trim(),
        title: $("#facultyTitle").value.trim(),
        email: $("#facultyEmail").value.trim(),
        department: $("#facultyDepartment").value.trim(),
        office: $("#facultyOffice").value.trim(),
        workload: editingFacultyIndex === null ? 0 : facultyData[editingFacultyIndex].workload,
        color: editingFacultyIndex === null ? "blue" : facultyData[editingFacultyIndex].color
    };
    const duplicate = facultyData.some((item, index) =>
        index !== editingFacultyIndex && item.email.toLowerCase() === faculty.email.toLowerCase()
    );
    if (duplicate) {
        showToast("A faculty profile with this email already exists.");
        $("#facultyEmail").focus();
        return;
    }

    try {
        if (editingFacultyIndex === null) {
            facultyData.push(await api.create("faculty", faculty));
        } else {
            const previous = facultyData[editingFacultyIndex];
            facultyData[editingFacultyIndex] = await api.update(`faculty/${previous.id}`, faculty);
        }
        $("#facultyDialog").close();
        renderFacultyOverview();
        renderOverview();
        showToast(editingFacultyIndex === null ? "Faculty profile added." : "Faculty profile updated.");
        editingFacultyIndex = null;
    } catch (error) {
        showToast(error.message);
    }
});

let editingStudentIndex = null;

function openStudentDialog(index = null) {
    editingStudentIndex = index;
    const student = index === null ? null : studentData[index];
    $("#studentForm").reset();
    $("#studentDialogTitle").textContent = student ? "Edit student" : "Add student";
    $("#saveStudentButton").textContent = student ? "Save changes" : "Add student";
    $("#studentName").value = student?.name || "";
    $("#studentEmail").value = student?.email || "";
    $("#studentNumber").value = student?.studentNumber || "";
    $("#studentProgram").value = student?.program || "";
    $("#studentYear").value = student?.year || "";
    $("#studentSection").value = student?.section || "";
    $("#studentDialog").showModal();
}

$("#studentSearch").addEventListener("input", renderStudents);
$("#addStudentButton").addEventListener("click", () => openStudentDialog());
$("#closeStudentDialog").addEventListener("click", () => $("#studentDialog").close());
$("#cancelStudentDialog").addEventListener("click", () => $("#studentDialog").close());
$("#studentsList").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-student]");
    if (editButton) openStudentDialog(Number(editButton.dataset.editStudent));
});
$("#studentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const student = {
        name: $("#studentName").value.trim(),
        email: $("#studentEmail").value.trim(),
        studentNumber: $("#studentNumber").value.trim(),
        program: $("#studentProgram").value.trim(),
        year: $("#studentYear").value.trim(),
        section: $("#studentSection").value.trim()
    };
    const duplicate = studentData.some((item, index) =>
        index !== editingStudentIndex &&
        (item.email.toLowerCase() === student.email.toLowerCase() ||
            item.studentNumber.toLowerCase() === student.studentNumber.toLowerCase())
    );
    if (duplicate) {
        showToast("A student with this email or student number already exists.");
        return;
    }

    const isAddingStudent = editingStudentIndex === null;
    try {
        if (isAddingStudent) {
            studentData.push(await api.create("students", student));
        } else {
            const previous = studentData[editingStudentIndex];
            studentData[editingStudentIndex] = await api.update(`students/${previous.id}`, student);
        }
        $("#studentDialog").close();
        renderStudents();
        renderOverview();
        showToast(isAddingStudent ? "Student profile added." : "Student profile updated.");
        editingStudentIndex = null;
    } catch (error) {
        showToast(error.message);
    }
});

$("#recordSearch").addEventListener("input", renderRecords);

$("#systemPolicyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    try {
        systemPolicies = await api.replace("policies", {
            checkinWindow: Number($("#checkinWindow").value),
            defaultCapacity: Number($("#defaultCapacity").value),
            automaticNoShow: $("#automaticNoShow").checked,
            automaticCompletion: $("#automaticCompletion").checked
        });
        renderSystem();
        showToast("System policies saved.");
    } catch (error) {
        showToast(error.message);
    }
});

$("#systemPolicyForm").addEventListener("change", (event) => {
    if (event.target.matches("#automaticNoShow, #automaticCompletion")) updatePolicyStates();
});

async function initializeAdminPage() {
    try {
        [accountData, facultyData, studentData, consultationData, systemPolicies] = await Promise.all([
            api.get("accounts"),
            api.get("faculty"),
            api.get("students"),
            api.get("appointments"),
            api.get("policies")
        ]);
        renderOverview();
    } catch (error) {
        showToast(`Could not load ConsultHub data: ${error.message}`);
    }
}

initializeAdminPage();
