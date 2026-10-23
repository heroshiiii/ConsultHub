
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const formMessage = document.getElementById("formMessage");

// Check the school email address
function isSchoolEmail(email) {
    const normalized = email.trim().toLowerCase();

    const validFormat =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);

    const schoolDomain =
        normalized.endsWith("@student.slsu.edu.ph") ||
        normalized.endsWith("@slsu.edu.ph");

    return {
        validFormat,
        schoolDomain
    };
}

// Handle the login form
if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const email = emailInput.value.trim();

        formMessage.textContent = "";
        formMessage.style.color = "#d04444";

        if (!email) {
            formMessage.textContent =
                "Please enter your school email address.";
            emailInput.focus();
            return;
        }

        const result = isSchoolEmail(email);

        if (!result.validFormat) {
            formMessage.textContent =
                "Please enter a valid email address.";
            emailInput.focus();
            return;
        }

        if (!result.schoolDomain) {
            formMessage.textContent =
                "Please use your SLSU school email address.";
            emailInput.focus();
            return;
        }

        formMessage.style.color = "#17866d";
        formMessage.textContent =
            "Email verified for demo. Connect a backend to send an OTP.";
    });
}

// Clear messages when the user edits the email
if (emailInput) {
    emailInput.addEventListener("input", function () {
        if (formMessage) {
            formMessage.textContent = "";
        }
    });
}
