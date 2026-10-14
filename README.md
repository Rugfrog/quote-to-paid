# Quote to Paid

A job system for UK tradespeople: enquiry → quote → job → invoice → paid.
Built as a sales demo that can be rebranded for each client.

> **Status:** Stages 1–3 done: foundations, the quote builder with AI quotes, the customer
> quote page and the outbox. Jobs, invoices and the dashboard come next.

## Running it

You need **Node.js 22 or newer** (`node --version` to check).

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**.

The first time it runs, it creates the database (`data/app.db`) and fills it with the demo
business, **Holme Valley Plastering & Building**.

| Login | Email | Password |
|---|---|---|
| Owner (Gary) | gary@example.com | demo1234 |
| Setup team (agency) | admin@example.com | agency1234 |

**On your phone:** while `npm run dev` is running, open the "Network" address it prints
(for example `http://192.168.0.20:5173`) on a phone connected to the same Wi-Fi.
Voice notes need a secure (`https://`) address on phones, so they won't work over Wi-Fi like
this. They do work on the live website, and on `localhost` on your computer.

## The quote flow

1. **New quote** (the big **+** button, or **Quote this** on an enquiry).
2. Pick the customer, then **record a voice note**, type a description and/or add photos.
3. **Build my quote**: lines are matched to your price list and priced from it. Anything
   that isn't on the list is marked **Check price** and left out of the total until you price it.
4. Edit anything: lines, quantities, notes, exclusions, deposit, validity, and up to three
   good/better/best options. Changes save automatically.
5. **Send**: the customer gets an email (or a text if there's no email) with a link like
   `/q/…`. They can view it on their phone, download the PDF, ask a question, accept (typed
   name + tick box) or decline. You get a notification and an email.
6. The **Outbox** shows every message exactly as the customer would get it. Nothing is really
   sent in the demo.

### Other commands

| Command | What it does |
|---|---|
| `npm run reset` | Wipes everything (including uploaded photos) and reloads the demo data |
| `npm test` | Runs the automated tests |
| `npm run typecheck` | Checks the TypeScript |
| `npm run build` then `npm start` | Runs a production build on http://localhost:3001 (one server) |

## Putting it online (public demo website)

The repo includes `render.yaml`, so it can run as a free website on [Render](https://render.com):

1. Sign up at render.com with your GitHub account.
2. **New → Blueprint**, pick the `quote-to-paid` repo.
3. Render asks for the secret settings:
   - `OWNER_PASSWORD`: the password you'll give friends for `gary@example.com`
     (12+ characters; three or four random words works well);
   - `AGENCY_PASSWORD`: a different one, just for you, for `admin@example.com`;
   - `ANTHROPIC_API_KEY`: your Claude key (or leave blank for demo mode).
4. Click **Apply**. After a few minutes you get an address like
   `https://quote-to-paid.onrender.com`. Every push to `main` redeploys automatically.

### How the live site is protected

- **Private passwords.** `OWNER_PASSWORD` and `AGENCY_PASSWORD` live only in Render's
  settings, never in the code (which is public). They replace `demo1234` and `agency1234`,
  and the login page stops showing any logins.
- **Everything is behind the login**, including the AI. Visitors who aren't logged in can
  only see the login page and customer quote links (long random tokens), which never call
  the AI.
- **A daily cap on AI quotes** (`AI_DAILY_LIMIT`, 50 on the live site). After that, quotes
  use the built-in estimator until midnight.
- **Password guessing is blocked:** 10 wrong tries per person, or 20 per account from
  anywhere, locks logins for 15 minutes. Passwords are stored hashed with bcrypt, and the
  site is HTTPS only.
- **Safety check:** with an `ANTHROPIC_API_KEY` set, the site refuses to start unless both
  private passwords are set (12+ characters).
- **Demo mode** (`DEMO_MODE=1`): data resets every 6 hours and on every deploy, and logins
  can't be changed in the app.

**Also set a monthly spend limit** in the Anthropic Console (Settings → Limits). It's the
backstop if the password ever gets passed around. To change the password, edit
`OWNER_PASSWORD` in Render. The site restarts with the new one.

Without private passwords the site still runs, as an open demo with the logins shown on
the login page. That's fine without an AI key.

Free plan limits: the site sleeps after 15 minutes without visitors, and the first visit
after that takes about a minute to wake it. Upgrade the Render plan to keep it awake.

## Rebranding for a new client

Each client gets their own copy of the app (and their own database). To set one up:

1. Log in as the **setup team** (`admin@example.com`) and open **Client setup**.
2. Work down the checklist. Each line links to the right settings page:
   - business name, address and phone
   - logo (PNG/JPEG) and brand colour (the whole app, PDFs and customer pages follow it,
     and light colours are darkened automatically so text stays readable)
   - VAT on/off and VAT number
   - bank details for invoices
   - price list: type it in, or **Price list → Import** a CSV with `category,name,description,unit,price`
     columns (a template is downloadable from the import screen)
   - quote terms and conditions, deposit %, payment terms, number prefixes
   - team members
3. Under **Logins**, change the owner's email and set a password for them.
4. To start with a clean database instead of the demo data, edit `server/db/seed-data.ts`
   (or clear the demo rows) and run `npm run reset`.

## Turning on the real AI

Without a key, quotes use **demo mode**: a built-in estimator that recognises common
plastering and building jobs (re-plastering, skimming, ceilings, Artex, coving, rendering,
stud walls, lintels, chimney breasts, patch repairs) and measurements like "4 by 3 metres" or
"40m²". It works offline and costs nothing.

To use Claude for real:

1. Copy `.env.example` to `.env` (or, on the live site, set it in Render → Environment).
2. Set `ANTHROPIC_API_KEY=` to your key from console.anthropic.com.
3. Restart `npm run dev`. The quote banner then says **Worked out by AI** instead of
   **Demo mode**.

How it works (`server/services/ai/`):

- Claude gets the description, up to 4 photos and your price list **without prices**, and
  must answer in a fixed JSON shape (structured outputs): lines with a price list id,
  quantity and unit, plus exclusions, questions to ask and assumptions.
- **Prices always come from your price list, never from the AI.** The server swaps in the
  price and unit of the matching item; anything else is marked "check price".
- Model: `claude-opus-5-5` at low effort, which keeps it quick. Set `ANTHROPIC_MODEL` to change
  it, e.g. `claude-haiku-5-5` is much cheaper and faster, at some cost to accuracy.
- If Claude declines a request, the API automatically retries on a fallback model.
- If it fails or takes longer than 30 seconds, the quote is built by demo mode instead,
  with a note saying so. What you typed is saved on the quote either way.
- `AI_DAILY_LIMIT` (default 100) caps real AI quotes per day.

`.env` is git-ignored. Never commit keys.

## How it's built

- **Backend:** Node + Express + TypeScript (`server/`), run with `tsx`, no build step needed.
- **Database:** SQLite through `better-sqlite3`, one file at `data/app.db`. Schema in
  `server/db/schema.sql`, demo data in `server/db/seed-data.ts`.
- **Frontend:** React + Vite (`web/`), hand-written CSS (`web/styles/app.css`). Brand colours
  are CSS variables set at runtime.
- **Shared:** `shared/` holds the money maths, UK formatting and input rules, used by both
  sides so the screen and server always agree.

### Money rules

- All amounts are stored as **whole pence** (integers). Never floats.
- Percentages are stored as basis points (20% = 2000). Quantities as hundredths (12.5 m² = 1250).
- VAT is worked out **once per document** on the subtotal, rounded half-up (HMRC allows
  rounding at invoice level). One function (`shared/money.ts → calculateTotals`) is used
  everywhere, so screen, PDF and customer page totals always match.

### Security

- Owner logins use bcrypt-hashed passwords and an httpOnly session cookie. Only a hash of the
  session token is stored. Login attempts are rate-limited.
- Every input is validated on the server (`shared/schemas.ts`, zod).
- Customer links use 32-byte random tokens and only show what the customer needs (never your
  private notes, the AI's questions or the history). Customer actions are rate-limited.
- Uploads accept only JPEG/PNG/WebP/GIF (no SVG), up to 10 MB, saved with random names.

## Decisions made along the way

Where the brief left room, these are the choices made:

- **One business per install.** Each client gets their own copy and database, which suits a
  one-off fee and per-client tailoring. The setup team's admin page manages that copy.
- **Node 24 LTS** was installed on the build machine. The project works on Node 22 or newer.
- **Items in the price list are hidden, never deleted**, so old quotes still make sense.
- **CSV import** can add to the price list or replace it (replaced items are hidden, not deleted).
- **Phone photos are shrunk in the browser** (max 1600px) before upload, for speed on mobile data.
- **Uploaded photos are served from `/uploads/` with random, unguessable names** but no login
  check, so customers can see photos on their quote pages. Fine for a demo; a client
  deployment storing sensitive images should move to signed URLs.
- **Phone navigation:** Home, Quotes, a big "+" button, Jobs and Money along the bottom.
  Customers and the menu (price list, outbox, settings) are in the top bar. On a laptop
  everything is in the sidebar.
- **Demo details are made up:** phone numbers from Ofcom's drama range (07700 900xxx),
  example.com emails, VAT number marked "(example)", sort code 12-34-56.
- **Stages 2 and 3 were built together**, so the AI quote (the sales wow) reached the live
  site sooner.
- **Quotes can be edited after sending** until they're accepted, declined or expired. The
  customer always sees the latest version.
- **The owner can accept or decline on the customer's behalf** (e.g. a "yes" on the phone),
  including from the preview page. The history records that it was the business, not the
  customer. The owner opening the link while logged in doesn't count as the customer viewing it.
- **Customers without an email get a text** with the link instead.
- **Materials markup** in the price list is added as a line worth that % of the option's
  current subtotal, at the moment you add it. The AI never uses markup or minimum-charge items.
- **The "valid until" date is set when the quote is sent** (sending again restarts it).
- **Demo data includes 10 quotes** at every stage (accepted, declined, opened, unopened, a
  three-option quote and a draft with a price to check), spread over the last 7 weeks.
