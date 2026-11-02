const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const formMessage = document.getElementById("formMessage");
const otpPanel = document.getElementById("otpPanel");
const otpForm = document.getElementById("otpForm");
const otpInputs = [...document.querySelectorAll(".otp-digit")];
const otpMessage = document.getElementById("otpMessage");
const resendButton = document.getElementById("resendOtpButton");
let verifiedEmail = "";
let resendTimer = null;

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

async function postJson(path, data) {
    const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The request could not be completed.");
    return result;
}

function setResendCountdown(seconds) {
    clearInterval(resendTimer);
    let remaining = seconds;
    resendButton.disabled = true;
    resendButton.textContent = `Resend in ${remaining}s`;
    resendTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            clearInterval(resendTimer);
            resendTimer = null;
            resendButton.disabled = false;
            resendButton.textContent = "↻ Resend code";
            return;
        }
        resendButton.textContent = `Resend in ${remaining}s`;
    }, 1000);
}

async function requestOtp(email, isResend = false) {
    const button = isResend
        ? resendButton
        : loginForm.querySelector('button[type="submit"]');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = isResend ? "Sending..." : "Sending code...";
    if (isResend) otpMessage.textContent = "";
    else formMessage.textContent = "";

    try {
        const result = await postJson("/api/auth/request-otp", { email });
        verifiedEmail = result.email;
        if (!isResend) {
            document.getElementById("otpEmail").textContent = result.email;
            loginForm.hidden = true;
            otpPanel.hidden = false;
            otpInputs.forEach((input) => { input.value = ""; });
            otpInputs[0].focus();
        }
        document.getElementById("otpDestinationMessage").textContent = result.demoMode
            ? "Your demo code is ready for"
            : "We sent a 6-digit code to";
        document.getElementById("otpDeliveryStatus").textContent = result.demoMode
            ? "DEMO MODE · CODE READY"
            : "CODE SENT SUCCESSFULLY";
        document.getElementById("demoCodeHint").hidden = !result.demoMode;
        setResendCountdown(result.resendAfter);
    } catch (error) {
        if (isResend && error.message.includes("wait before")) {
            setResendCountdown(30);
        }
        const message = error.message || "Could not connect to the server. Please try again.";
        if (isResend) otpMessage.textContent = message;
        else formMessage.textContent = message;
    } finally {
        if (!isResend) {
            button.disabled = false;
            button.textContent = "→  Send OTP Code";
        } else if (!resendTimer) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = emailInput.value.trim().toLowerCase();
        formMessage.style.color = "#d04444";

        if (!email) {
            formMessage.textContent = "Please enter your email address.";
            emailInput.focus();
            return;
        }
        if (!isValidEmail(email)) {
            formMessage.textContent = "Please enter a valid email address.";
            emailInput.focus();
            return;
        }
        await requestOtp(email);
    });
}

otpInputs.forEach((input, index) => {
    input.addEventListener("input", () => {
        const digits = input.value.replace(/\D/g, "");
        if (digits.length > 1) {
            digits.slice(0, otpInputs.length - index).split("").forEach((digit, offset) => {
                otpInputs[index + offset].value = digit;
            });
        } else {
            input.value = digits;
        }
        if (input.value && index < otpInputs.length - 1) otpInputs[index + 1].focus();
        otpMessage.textContent = "";
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !input.value && index > 0) {
            otpInputs[index - 1].focus();
        } else if (event.key === "ArrowLeft" && index > 0) {
            otpInputs[index - 1].focus();
        } else if (event.key === "ArrowRight" && index < otpInputs.length - 1) {
            otpInputs[index + 1].focus();
        }
    });

    input.addEventListener("paste", (event) => {
        event.preventDefault();
        const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, otpInputs.length);
        digits.split("").forEach((digit, offset) => { otpInputs[offset].value = digit; });
        otpInputs[Math.min(digits.length, otpInputs.length - 1)].focus();
    });
});

if (otpForm) {
    otpForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const code = otpInputs.map((input) => input.value).join("");
        if (code.length !== 6) {
            otpMessage.textContent = "Enter all 6 digits of the verification code.";
            otpInputs.find((input) => !input.value)?.focus();
            return;
        }

        const button = document.getElementById("verifyOtpButton");
        button.disabled = true;
        button.textContent = "Verifying...";
        otpMessage.textContent = "";
        try {
            const result = await postJson("/api/auth/verify-otp", {
                email: verifiedEmail,
                code
            });
            window.location.assign(result.redirect);
        } catch (error) {
            otpMessage.textContent = error.message || "Could not verify the code. Please try again.";
            otpInputs.forEach((input) => { input.value = ""; });
            otpInputs[0].focus();
        } finally {
            button.disabled = false;
            button.textContent = "Verify & Sign In";
        }
    });
}

resendButton.addEventListener("click", () => requestOtp(verifiedEmail, true));

document.getElementById("useDifferentEmail").addEventListener("click", () => {
    clearInterval(resendTimer);
    resendTimer = null;
    otpPanel.hidden = true;
    loginForm.hidden = false;
    otpMessage.textContent = "";
    document.getElementById("demoCodeHint").hidden = true;
    emailInput.focus();
});

emailInput.addEventListener("input", () => {
    formMessage.textContent = "";
});
