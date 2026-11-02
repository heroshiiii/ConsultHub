# ConsultHub

ConsultHub is a demo web app with an Express/Node.js backend and MongoDB database.

## Run on Windows

### 1. Install prerequisites

- Install [Node.js 18 or newer](https://nodejs.org/). This project uses `npm.cmd` in PowerShell.
- Choose one MongoDB option:
  - **MongoDB Atlas:** create a cluster and have its connection string ready.
  - **MongoDB Community Server:** install and start MongoDB on your computer. The default local address is `mongodb://127.0.0.1:27017/consulthub`.

### 2. Configure the database

Open PowerShell in the project folder (the folder containing `server.js` and `package.json`).

The app reads its settings from `.env`:

```text
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/sa1_project
```

If `.env` does not exist, copy the example:

```powershell
Copy-Item .env.example .env
```

Then open `.env` in VS Code and set `MONGODB_URI` to your MongoDB connection string. The database name must match the database in Compass. For Atlas, use the connection string provided by Atlas and replace its username, password, and database name with your own. Do not share or commit `.env`; it contains private database credentials.

### 3. Install dependencies

Run this once from the project folder, and again after dependency changes:

```powershell
npm.cmd install
```

### 4. Start ConsultHub

```powershell
npm.cmd start
```

Wait for the message that ConsultHub is available, then open the address using the port in your `.env`. For example, if it says `PORT=5000`, open:

**http://localhost:5000**

The app's root address redirects to the landing page. The same Node.js server serves the frontend and `/api/...` backend routes, so the browser pages and API use the same origin and can access MongoDB through the backend.

The landing page accepts any valid email address in the MongoDB `users` collection when `isActive` is `true` or `status` is `active`. Emails are matched without case sensitivity. The admin account page also reads and writes this same `users` collection; account records use `fullName`, `email`, `role`, and `isActive`. It does not require a particular school or email domain. The app then sends a one-time verification code. In development without email settings, use the clearly labeled demo code `123456`. Keep the PowerShell window running while you use the site. To stop the server, focus that window and press **Ctrl+C**.

## Deploy to Vercel

1. Push this project to a GitHub repository and import that repository from the Vercel dashboard. Keep the project root set to the folder containing `server.js` and `package.json`; Vercel detects the Express app automatically.
2. Create a MongoDB Atlas database if you do not already have a hosted database. In Atlas, configure a database user and network access so Vercel can connect. Vercel's outbound IPs may vary; prefer a fixed egress option when available rather than allowing every IP.
3. In the Vercel project's **Settings → Environment Variables**, add:
   - `MONGODB_URI` — the Atlas connection string, including the database name.
   - `BREVO_API_KEY` — your Brevo API key.
   - `BREVO_SENDER_EMAIL` — the verified sender address.
   - `BREVO_SENDER_NAME` — optional; defaults to `ConsultHub`.
   - `CRON_SECRET` — a long random secret used to authorize scheduled appointment maintenance.
4. Deploy or redeploy the project. Vercel provides a public URL; `PORT` is not needed there. Do not copy `.env` into the repository or paste its contents into chat.
5. Open the Vercel URL and check `/api/health`; it should return `{"status":"ok"}`. Production OTP delivery requires both Brevo settings above.

Login sessions and OTP challenges are stored in MongoDB so Vercel function instances can share authentication state. The app creates `login_sessions`, `otp_challenges`, and `appointment_history` collections as needed and expires session/OTP records automatically. API routes do not yet enforce role-based permissions, so do not rely on this demo for real users without reviewing its authorization rules.

Appointment check-in opens for the policy-configured window (20 minutes by default) before the scheduled start and closes 10 minutes before the scheduled end. A successful check-in cannot be undone. Appointments not checked in by the cutoff are automatically marked as no-shows; checked-in appointments are marked completed after their scheduled end when automatic completion is enabled. Finalized records are copied to the `appointment_history` collection and included in appointment, history, and dashboard data.

Faculty can cancel an availability slot even when students have reserved it. The app cancels those appointments, archives them for the students' history, and removes the slot. Slot cancellation and new bookings use MongoDB transactions so they cannot race each other.

Appointment maintenance runs on API requests and through the Vercel Cron configured in `vercel.json`. Keep `CRON_SECRET` set in Vercel. Vercel Hobby cron jobs run only once per day with up to 59 minutes of scheduling delay; while a student or faculty dashboard is open, it refreshes appointments every minute and applies any due status changes. Minute-precise background processing when nobody is using the app requires a plan or scheduler that supports minute-level cron; on such a plan, change the cron schedule in `vercel.json` to `* * * * *` and redeploy. Check-in dates and times are interpreted in Asia/Manila time.

### Configure real OTP email delivery (optional)

The sample project can send codes through Brevo. Create a Brevo API key and verify a sender email address in Brevo, then add these values to `.env`:

```text
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=your_verified_sender@example.com
BREVO_SENDER_NAME=ConsultHub
```

Restart the app after changing `.env`. With both the API key and sender configured, the backend sends a random code to the registered email. Without them, local development uses demo code `123456`; production mode refuses to send OTPs until email is configured.

The app does not create sample accounts, faculty, students, or availability slots. Add real accounts and profiles through the Admin portal, and faculty can manage their own profiles and availability. A default policy record is created only when none exists. On startup, existing non-demo records from the old `accounts` collection are copied into `users` when their email is not already present; the old collection is retained as a backup and is no longer read or written by the app. Known sample account emails are excluded from this legacy-account migration so deleted demo accounts do not return. Faculty profiles store college and department; administrators can edit these in Faculty information management and faculty can edit them in Profile Settings. Set a room/location on each availability slot, so students see the correct room for the specific appointment. Existing slots without a location inherit the faculty profile's legacy office value (or "Room to be confirmed"). New availability slots are saved to `slots`, and student bookings are saved to `appointments`, using the signed-in student's identity rather than values supplied by the browser. Appointment reason, selected date and time, student, faculty, college, department, location, status, and check-in are stored with each appointment; slot date, time range, location, capacity, and reservation count are stored with each slot. Existing records in the old `consultations` collection are copied into `appointments` on startup.

## Troubleshooting

- **`MONGODB_URI is required`:** check that `.env` exists in the same folder as `server.js` and contains a `MONGODB_URI=...` line.
- **MongoDB connection error:** ensure your local MongoDB service is running, or check the Atlas connection string, database user/password, and allowed network IP addresses.
- **Port is already in use:** set another `PORT` value in `.env`, restart the server, and open `http://localhost:<port>`.
- **The page does not load data:** open `http://localhost:<port>/api/health`, using the same port as the site. It should return `{"status":"ok"}` while the server and database are connected.
- **Browser says `ERR_CONNECTION_REFUSED`:** the Node server is not running. If the terminal shows `Terminate batch job (Y/N)?`, type `Y` and press Enter to finish stopping the old server. Then run `npm.cmd start` again and leave that terminal open while using the site.
- **Do not open the HTML files directly** or use VS Code Live Server; the pages need to be served by the Node.js app so their `/api/...` requests reach the backend.

## Demo limitations

Login validates the email format and checks for a matching active account in MongoDB. Any email domain is allowed, but the email must already be recorded in the database. The OTP expires after five minutes and has a five-attempt limit; resend is rate-limited to 30 seconds. A successful verification opens the role-specific dashboard and starts an eight-hour session; dashboards and API routes reject requests without an active session. OTP challenges and sessions are held in server memory and are cleared when the server restarts. The local demo code is fixed and does not verify mailbox ownership, so configure Brevo email delivery before using this beyond local demonstrations. API routes also do not yet enforce role-based permissions.

## API routes

- `GET /api/health`
- `POST /api/auth/request-otp`
- `POST /api/auth/verify-otp`
- `POST /api/auth/logout`
- `GET /api/accounts`, `POST /api/accounts`, `PATCH /api/accounts/:id`
- `GET /api/faculty`, `POST /api/faculty`, `PATCH /api/faculty/:id`
- `GET /api/students`, `POST /api/students`, `PATCH /api/students/:id`
- `GET /api/slots?facultyId=:id`, `POST /api/slots`, `PATCH /api/slots/:id`, `DELETE /api/slots/:id`
- `GET /api/appointments`, `POST /api/appointments`, `PATCH /api/appointments/:id`
- `GET /api/policies`, `PUT /api/policies`
