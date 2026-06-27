# AZDAH App — Feature Summary

*Last updated: 2026-06-28*

---

## For Members

**Joining**
- Browse membership plans and pay online via Razorpay
- Apply a promo/discount code at checkout to get a reduced price
- Automatic welcome message sent on WhatsApp after joining
- If someone tries to join again while already an active member, it blocks them with a clear message

**Member Dashboard**
- Log in with phone number + password
- View active membership, plan end date, classes booked
- Book classes, cancel bookings, join waitlist if class is full
- Reschedule a booked class
- Change password anytime (minimum 8 characters)
- First-time login forces a mandatory password change — can't skip it

**Automatic Reminders (WhatsApp)**
- Reminder sent 3 days before membership expires
- Reminder sent 2 hours before a booked class starts
- If someone cancels and you were on the waitlist, you get an instant WhatsApp notification that you've been promoted into the class

---

## For Admin

**Member Management**
- View all members with their plan, status, expiry date
- Activate or deactivate any member
- Reset a member's password — new password sent to them via WhatsApp automatically
- Freeze a membership (member is injured, travelling, etc.) — freezes their account and extends their plan end date by however many days they were frozen
- Issue a refund via Razorpay for any member who paid — full or partial. Full refund also deactivates the membership
- Direct link to open WhatsApp chat with any member in one click

**Class Management**
- Add single classes manually
- Create recurring classes — pick days of the week and how many weeks, it generates all classes automatically
- Mark attendance for each class
- View class bookings and waitlist

**Messaging**
- Broadcast a custom WhatsApp message to all members, only active members, or only members whose memberships are expiring soon

**Revenue & Reports**
- View revenue charts by month or by year
- Export all payment data as a CSV file (downloadable spreadsheet)

**Promo Codes**
- Create discount codes with a percentage off
- Set an expiry date and a maximum number of uses per code
- Codes automatically stop working after they expire or hit the usage limit

**Security**
- Admin login requires a one-time password (OTP) sent to WhatsApp — two-factor authentication
- Every admin action (activating a member, creating a class, refunding, etc.) is logged with a timestamp — full audit trail

---

## Validations & Safeguards

- Phone number must be valid format before any payment
- Name must be at least 3 characters and cannot contain numbers
- Can't book a class if membership is expired or frozen
- Can't cancel a class that has already started
- Can't join if already an active member
- Promo codes checked for validity, expiry, and usage limit before applying
- Maximum 5 payment attempts per phone number per hour (prevents abuse)
- All cron jobs (automatic reminders) are protected so only Vercel can trigger them — no one can call them manually
