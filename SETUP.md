# AZDAH Fitness App — Setup Guide

## Tech Stack
- **Next.js 14** (App Router, TypeScript)
- **Supabase** — database + auth
- **Razorpay** — payments
- **Meta WhatsApp Cloud API** — automated messages
- **Cloudflare Pages** — deployment

---

## Step 1: Database (Supabase)

1. Go to https://app.supabase.com → New project
2. Name it `azdah-fitness`
3. SQL Editor → New query → paste entire `supabase/schema.sql` → Run
4. Settings → API → copy URL, anon key, service_role key

---

## Step 2: Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ADMIN_NUMBER=91XXXXXXXXXX
SESSION_SECRET=<generate a random 40 char string>
ADMIN_PHONE=91XXXXXXXXXX         # your phone number
ADMIN_PASSWORD=<strong password>
```

---

## Step 3: WhatsApp Message Templates

Go to Meta Business Suite → WhatsApp → Message Templates → Create 4 templates:

| Template Name | Category | Body |
|---|---|---|
| `azdah_welcome` | UTILITY | Hi {{1}}! Welcome to AZDAH Fitness. Your {{2}} membership is active. Login at azdahfit.in — Username: {{3}} · Password: {{4}}. See you at the gym! 💪 |
| `azdah_admin_new_member` | UTILITY | New member: {{1}} · {{2}} joined with {{3}} plan. Amount: {{4}}. |
| `azdah_booking_confirmed` | UTILITY | Hi {{1}}! Your booking for {{2}} on {{3}} at {{4}} is confirmed. See you there! — AZDAH Fitness |
| `azdah_reschedule_confirmed` | UTILITY | Hi {{1}}! Rescheduled to {{2}} on {{3}} at {{4}}. — AZDAH Fitness |

Templates need 24-48hr approval from Meta.

---

## Step 4: Razorpay Setup

1. Login to Razorpay Dashboard → Settings → API Keys → Generate Live Key
2. Paste KEY_ID and KEY_SECRET into `.env.local`

---

## Step 5: Local Development

```bash
npm install
npm run dev
```
Open http://localhost:3000

---

## Step 6: Deploy to Cloudflare Pages

1. Push code to GitHub
2. Cloudflare Pages → New project → Connect to GitHub repo
3. Build settings:
   - Build command: `npm run build`
   - Output directory: `.next`
4. Add all env variables in Cloudflare Pages → Settings → Environment Variables
5. Enable "Next.js" preset (automatic)

---

## Admin Login

- URL: `https://azdahfit.in/login`
- Phone: value of `ADMIN_PHONE` (without +91)
- Password: value of `ADMIN_PASSWORD`

---

## Membership Plans (to customize)

Edit directly in Supabase → Table Editor → membership_plans.
Change prices (in paise — ₹1 = 100 paise), names, features.

---

## Monthly Flow

1. Member joins → pays via Razorpay
2. System creates account → sends WhatsApp with login + password
3. Admin gets WhatsApp alert
4. Member logs in → sees dashboard → books classes
5. Member can reschedule 1x per calendar month
6. Admin can add/cancel classes, see all members
