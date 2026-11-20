# LinkedIn post: UHID National Hospital Management System

Paste the text between the lines into LinkedIn. Attach the images in the order listed below the post.
Before you post, replace the three [BRACKETED] items.

---

We built a nationwide hospital management system for our Database Management System course. 🏥

A patient treated in Sylhet arrives in Dhaka with no history, no allergy list and no medication record. In Bangladesh, health records mostly stay inside the hospital that made them, and often on paper.

Our answer is UHID, a Unified Health ID. A patient gets one the first time they visit any connected hospital, and the record follows them to every other hospital on the network. A doctor in Chattogram can see the diagnosis written in Dhaka and the allergy noted in Sylhet.

What I'm proudest of is that the database itself enforces the rules, not the app:

🔹 One person, one UHID. Registration checks NID, name + date of birth and mobile number before issuing an ID.
🔹 Every record read is logged. MySQL has no trigger for reads, so a stored procedure writes the log row first and then returns the data. Emergency "break-glass" access needs a written reason and goes to an admin for review.
🔹 Two patients can never book the same slot. A unique key plus row locking inside a transaction guarantees it.
🔹 Bed status is changed only by triggers, never by app code.
🔹 Prescribe amoxicillin to a patient with a penicillin allergy and the trigger refuses it. The whole visit rolls back (screenshot 7).

By the numbers: 41 tables, 21 triggers, 84 stored procedures and functions, 9 views, 309 automated database tests, and 60 API endpoints. The stack is MySQL 8, Node.js + Express, and plain HTML/CSS/JavaScript with no frameworks.

This is a course project, not a live service, and everything on screen is sample data.

What's next:
→ Real NID verification and SMS/OTP consent, so patients can approve access from their own phone
→ A patient-facing mobile app
→ Billing, pharmacy dispensing and imaging, which we left out of scope on purpose
→ Standards-based data exchange (HL7 FHIR) so other systems can plug in
→ Anonymised reporting on the ICD-10 coded diagnoses, such as disease trends by district
→ Hosting it over HTTPS with proper backups and monitoring

Built with my teammates Abir [SURNAME] and Noria [SURNAME] at the Department of ICT, Bangladesh University of Professionals. Thank you to our course teacher for the guidance.

Code: https://github.com/NoboIshraque/hospital-management-system  [use only if the repo is public]

#DatabaseManagement #MySQL #NodeJS #HealthTech #DigitalHealth #Bangladesh #BUP #StudentProject #SQL

---

## Image order (swipe-through carousel)

| # | File | What it shows |
|---|---|---|
| 1 | `01-home.png` | Public landing page: "One patient. One record. Every hospital." |
| 2 | `02-national-search.png` | National patient search. NID and mobile are masked; every result is logged |
| 3 | `03-patient-record.png` | Patient record: allergy banner, referral, encounters from 4 hospitals |
| 4 | `04-access-log.png` | "Who has viewed this": consent, treating clinician and break-glass reads |
| 5 | `05-ward-bed-board.png` | Ward bed board: 36 beds, status set by database triggers |
| 6 | `06-find-a-doctor.png` | Doctor search across hospitals, with availability computed from schedules |
| 7 | `07-allergy-conflict.png` | The database refusing a penicillin-class prescription and rolling back the visit |

If LinkedIn limits you, the strongest four are 1, 3, 4 and 7.

## Alt text (paste into LinkedIn's "Add alt text" for each image)

1. Landing page of the UHID National Health Record with the headline "One patient. One record. Every hospital."
2. Patient search results listing two records named Md. Rahim Uddin with masked phone numbers.
3. A patient record showing a severe penicillin allergy banner, a hospital referral and a timeline of encounters across four hospitals.
4. An access log listing every doctor who opened a patient record, including an emergency break-glass entry with its reason.
5. A ward bed board of 36 beds in four wards, colour-coded as free, occupied, reserved or cleaning.
6. A grid of doctors from hospitals across Bangladesh with their next free appointment and consultation fee.
7. A red banner reading "Nothing was saved: Allergy conflict", showing a prescription refused because of a recorded penicillin allergy.
