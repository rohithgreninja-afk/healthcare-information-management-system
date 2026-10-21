# Healthcare Information Management System (HIMS)

The Healthcare Information Management System (HIMS) is a web-based application designed to efficiently store, manage, and retrieve patient healthcare information. Built as a front-end project using HTML5, CSS3, and Vanilla JavaScript, HIMS provides a clean role-based interface that brings structure and accessibility to everyday healthcare workflows.

This system helps streamline:
- Patient records management
- Appointment scheduling
- Medical history tracking
- Healthcare data organisation

The goal of this project is to improve accessibility, reduce paperwork, and enhance the overall efficiency of healthcare data management — giving patients, doctors, and administrators a dedicated space to view and manage the information relevant to them.

---

## Authors

- Rohith Ram V
- Vaishakh Manoj Nair

---

## Project Structure

    HIMS/
      images/                    - Image assets
      index.html                 - Landing page
      role.html                  - Role selection page
      patient.html               - Patient module
      doctor.html                - Doctor module
      admin.html                 - Admin module
      style.css                  - Landing page styles
      dashboard.css              - Role selection page styles
      patient.css                - Patient module styles
      doctor.css                 - Doctor module styles
      admin.css                  - Admin module styles
      main.js                    - Landing page JS (form validation)
      role.js                    - Role selection JS (sessionStorage)
      dashboard.js               - Shared navbar JS
      patient.js                 - Patient module JS
      doctor.js                  - Doctor module JS
      admin.js                   - Admin module JS
      reset.js                   - Shared data reset JS
      HIMS-Development Log.docx  - Version history and development log
      README.md

---

## Technologies

The existing UI remains HTML5, CSS3, and vanilla JavaScript. A local Node.js server serves the UI and JSON API. The API stores records in SQLite through Node's built-in `node:sqlite` module. Nodemailer sends optional appointment email notifications through SMTP.

---

## How to Run Locally on Windows

1. Install Node.js 22.13 or newer (Node.js 24 is recommended).
2. In PowerShell, open this project folder.
3. Copy `.env.example` to `.env` if you want to change the port or database location. Defaults are `PORT=3000` and `DB_FILE=./data/hims.sqlite`.
4. Run `npm install` once to install the project dependencies.
5. Run `npm start` for normal use, or `npm run dev` to restart the server when `server.js` changes.
6. Open `http://localhost:3000` in a browser. Do not open the HTML files directly; the API requires the server.

The first startup creates `data/hims.sqlite`, applies `schema.sql`, and inserts the sample records. The SQLite database is ignored by Git. To restore the sample records, use **Reset Data** from a dashboard.

## Email Login and Appointment Notifications

New accounts use only an email address and password to sign in; a phone number is not required during signup or login. Patients and doctors must opt in to email notifications at signup. For an account created before this change, use **Link your email first** once on the login page. That migration screen uses the old phone number and current password to find the existing account, then links an email; its role, records, and password remain unchanged. After migration, sign in with the email. Administrator signup still requires the private `ADMIN_SIGNUP_CODE`.

SMTP delivery is optional. If it is not configured, appointments still save and the notification log records `not_configured`. When configured, HIMS emails booking notices to the patient and assigned doctor, and emails updates when an appointment is completed or cancelled. The message contains appointment names, date, time, and status, but not symptoms or clinical notes. A successful SMTP response means the mail server accepted the message, not that it reached the inbox.

For a Gmail test sender:

1. Enable 2-Step Verification on the Google account that will send HIMS emails.
2. Create an App Password in Google Account security settings. Use the generated app password, not your normal Google password. Google notes that App Passwords require 2-Step Verification and may be unavailable for some account types. See [Google's App Password instructions](https://support.google.com/accounts/answer/185833?hl=en).
3. In the project-root `.env`, set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER` to the sender Gmail address, `SMTP_PASS` to the App Password, and `MAIL_FROM` to `HIMS <sender@gmail.com>`. Keep the real values out of frontend files and Git.
4. Restart HIMS with `npm start`, create or migrate opted-in patient and doctor accounts, then book a test appointment. Check the server log and SQLite `notification_log` table for acceptance or failure.

The current sender uses Nodemailer over SMTP. For a deployed service, use a dedicated transactional email provider and its credentials instead of a personal mailbox.

---

## Role Access

| Role    | Access |
|---------|--------|
| Patient | Personal info, assigned doctor, appointments, medical records, billing |
| Doctor  | Overview, patient list, upcoming appointments, patient details, prescription and diagnosis |
| Admin   | Overview, manage patients, manage doctors, billing |

---

## Features

**Patient Module**
- View personal information and assigned doctor details
- View upcoming and past appointments
- Book new appointments with complaints and symptoms
- Cancel upcoming appointments
- View medical records — diagnosis history, prescriptions, and lab results
- View billing and payment status

**Doctor Module**
- Overview stats — total patients, appointments, and pending consultations
- View list of assigned patients with clickable rows for full details
- Mark appointments as completed
- Add diagnosis notes and prescriptions per patient
- Patient appointments booked through the Patient module reflect here
- Patient selection via table row click or dropdown

**Admin Module**
- Overview stats — total patients, doctors, invoices, and revenue
- Add and delete patients
- Add doctors
- Add invoices and toggle paid/unpaid status
- All billing changes reflect in the Patient module

---

## Data Persistence

Patient, doctor, invoice, appointment, diagnosis, prescription, contact-message, account, and session data is stored by the local API in SQLite. The API enforces role-based access for local accounts. Run this local demo with fictional data only; it has not been configured with production hosting or clinical-data compliance controls.

---

## Resetting Data

Each module page has a **Reset Data** button in the top navbar. Clicking it restores all data to the original preset state after a confirmation prompt.

---

## Browser Compatibility

Tested and confirmed on:
- Google Chrome
- Opera / Opera GX

Other browsers may work but have not been tested.

---

## Notes

- The pages use HTML, CSS, and browser JavaScript, with account and application data stored by the local server in SQLite.
- Email delivery requires SMTP credentials in `.env`; never put these credentials in frontend files or commit `.env`.

---

## Development Log

See `HIMS-Development Log.docx` for the full version-based milestone summary.

