# Quote to Paid

A job system for UK tradespeople: enquiry → quote → job → invoice → paid.
Built as a sales demo that can be rebranded for each client.

> **Status:** Stage 1 of 7 (foundations). Quotes, jobs, invoices, the AI quote builder,
> the dashboard and the outbox are built in later stages.

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

### Other commands

| Command | What it does |
|---|---|
| `npm run reset` | Wipes everything (including uploaded photos) and reloads the demo data |
| `npm test` | Runs the automated tests |
| `npm run typecheck` | Checks the TypeScript |
| `npm run build` then `npm start` | Runs a production build on http://localhost:3001 (one server) |

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

The AI quote builder arrives in Stage 3. It will work without a key (demo mode, with built-in
examples). To use Claude for real:

1. Copy `.env.example` to `.env`.
2. Set `ANTHROPIC_API_KEY=` to your key from console.anthropic.com.
3. Restart `npm run dev`.

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
- Customer links (from Stage 2) use 32-byte random tokens.
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
