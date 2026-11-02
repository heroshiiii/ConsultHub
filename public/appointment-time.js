const appointmentTime = {
    range(date, timeSlot) {
        const dateParts = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const times = [...String(timeSlot || "").matchAll(/(\d{1,2}:\d{2})(?:\s*(AM|PM))?/gi)];
        if (!dateParts || times.length < 2) return null;

        const toMinutes = (match) => {
            const clock = match[1].match(/^(\d{1,2}):(\d{2})$/);
            let hours = Number(clock[1]);
            const minutes = Number(clock[2]);
            if (minutes > 59) return null;
            if (match[2]) {
                if (hours < 1 || hours > 12) return null;
                hours = (hours % 12) + (match[2].toUpperCase() === "PM" ? 12 : 0);
            } else if (hours > 23) {
                return null;
            }
            return hours * 60 + minutes;
        };
        const startMinutes = toMinutes(times[0]);
        const endMinutes = toMinutes(times[1]);
        if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null;

        const [, year, month, day] = dateParts;
        const localDateStart = Date.UTC(Number(year), Number(month) - 1, Number(day)) - 8 * 60 * 60 * 1000;
        return {
            startsAt: localDateStart + startMinutes * 60 * 1000,
            endsAt: localDateStart + endMinutes * 60 * 1000
        };
    },

    isCheckInOpen(date, timeSlot, windowMinutes, closeBeforeEndMinutes = 10, now = Date.now()) {
        const range = this.range(date, timeSlot);
        return range !== null &&
            now >= range.startsAt - windowMinutes * 60 * 1000 &&
            now < range.endsAt - closeBeforeEndMinutes * 60 * 1000;
    }
};

if (typeof module !== "undefined" && module.exports) module.exports = appointmentTime;
if (typeof window !== "undefined") window.appointmentTime = appointmentTime;
