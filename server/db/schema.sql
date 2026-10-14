-- Quote to Paid database schema.
-- Money: integer pence. Percentages: basis points (2000 = 20%).
-- Quantities: integer hundredths (12.5 m² = 1250). Timestamps: ISO 8601 text (UTC).
-- Dates without a time (start_date, due_date…): "YYYY-MM-DD".

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Business and access
-- ---------------------------------------------------------------------------

-- One business per install (each client gets their own copy).
CREATE TABLE IF NOT EXISTS business (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  name                  TEXT    NOT NULL,
  trade                 TEXT    NOT NULL DEFAULT '',
  owner_name            TEXT    NOT NULL DEFAULT '',
  address_line1         TEXT    NOT NULL DEFAULT '',
  address_line2         TEXT    NOT NULL DEFAULT '',
  town                  TEXT    NOT NULL DEFAULT '',
  postcode              TEXT    NOT NULL DEFAULT '',
  phone                 TEXT    NOT NULL DEFAULT '',
  email                 TEXT    NOT NULL DEFAULT '',
  website               TEXT    NOT NULL DEFAULT '',
  logo_path             TEXT,
  brand_colour          TEXT    NOT NULL DEFAULT '#1f5f8b',
  vat_registered        INTEGER NOT NULL DEFAULT 1,
  vat_number            TEXT    NOT NULL DEFAULT '',
  vat_rate_bp           INTEGER NOT NULL DEFAULT 2000,
  bank_name             TEXT    NOT NULL DEFAULT '',
  account_name          TEXT    NOT NULL DEFAULT '',
  sort_code             TEXT    NOT NULL DEFAULT '',
  account_number        TEXT    NOT NULL DEFAULT '',
  quote_terms           TEXT    NOT NULL DEFAULT '',
  default_validity_days INTEGER NOT NULL DEFAULT 30,
  default_deposit_bp    INTEGER NOT NULL DEFAULT 0,
  payment_terms_days    INTEGER NOT NULL DEFAULT 14,
  quote_prefix          TEXT    NOT NULL DEFAULT 'Q-',
  quote_next            INTEGER NOT NULL DEFAULT 1,
  job_prefix            TEXT    NOT NULL DEFAULT 'J-',
  job_next              INTEGER NOT NULL DEFAULT 1,
  invoice_prefix        TEXT    NOT NULL DEFAULT 'INV-',
  invoice_next          INTEGER NOT NULL DEFAULT 1,
  reminders_default_on  INTEGER NOT NULL DEFAULT 1,
  updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('owner', 'staff', 'agency')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Only a hash of the session token is stored, so a copied database can't be used to log in.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- People who work on jobs. They don't log in.
CREATE TABLE IF NOT EXISTS team_members (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  phone      TEXT    NOT NULL DEFAULT '',
  role_label TEXT    NOT NULL DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------------
-- Price list and customers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS price_items (
  id               INTEGER PRIMARY KEY,
  category         TEXT    NOT NULL,
  name             TEXT    NOT NULL,
  description      TEXT    NOT NULL DEFAULT '',
  unit             TEXT    NOT NULL CHECK (unit IN ('m2', 'm', 'each', 'day', 'hour', 'item')),
  unit_price_pence INTEGER NOT NULL DEFAULT 0,
  kind             TEXT    NOT NULL DEFAULT 'standard'
                           CHECK (kind IN ('standard', 'markup_percent', 'minimum_charge')),
  rate_bp          INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  address_line1 TEXT NOT NULL DEFAULT '',
  address_line2 TEXT NOT NULL DEFAULT '',
  town          TEXT NOT NULL DEFAULT '',
  postcode      TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS enquiries (
  id          INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  description TEXT    NOT NULL,
  source      TEXT    NOT NULL DEFAULT 'phone'
                      CHECK (source IN ('phone', 'website', 'referral', 'walk-in', 'other')),
  status      TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'quoted', 'closed')),
  received_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_enquiries_customer ON enquiries(customer_id);

-- Photos, before/after shots, signatures and the logo.
CREATE TABLE IF NOT EXISTS attachments (
  id         INTEGER PRIMARY KEY,
  owner_type TEXT    NOT NULL CHECK (owner_type IN ('enquiry', 'quote', 'job', 'business')),
  owner_id   INTEGER NOT NULL,
  kind       TEXT    NOT NULL DEFAULT 'photo'
                     CHECK (kind IN ('photo', 'before', 'after', 'signature', 'logo')),
  file_path  TEXT    NOT NULL,
  mime       TEXT    NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  caption    TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments(owner_type, owner_id);

-- ---------------------------------------------------------------------------
-- Quotes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS quotes (
  id                 INTEGER PRIMARY KEY,
  number             INTEGER NOT NULL,
  ref                TEXT    NOT NULL UNIQUE,
  customer_id        INTEGER NOT NULL REFERENCES customers(id),
  enquiry_id         INTEGER REFERENCES enquiries(id) ON DELETE SET NULL,
  title              TEXT    NOT NULL DEFAULT '',
  status             TEXT    NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')),
  source             TEXT    NOT NULL DEFAULT 'blank' CHECK (source IN ('blank', 'text', 'voice', 'photo')),
  brief              TEXT    NOT NULL DEFAULT '',    -- what the owner typed or said (private, never shown to the customer)
  intro_notes        TEXT    NOT NULL DEFAULT '',
  exclusions         TEXT    NOT NULL DEFAULT '[]',  -- JSON array of strings
  customer_questions TEXT    NOT NULL DEFAULT '[]',  -- JSON array of strings (suggested by the AI)
  validity_days      INTEGER NOT NULL DEFAULT 30,
  valid_until        TEXT,
  deposit_bp         INTEGER NOT NULL DEFAULT 0,
  vat_registered     INTEGER NOT NULL DEFAULT 1,     -- copied from the business when created
  vat_rate_bp        INTEGER NOT NULL DEFAULT 2000,  -- copied from the business when created
  public_token       TEXT    NOT NULL UNIQUE,
  sent_at            TEXT,
  first_viewed_at    TEXT,
  last_viewed_at     TEXT,
  accepted_at        TEXT,
  accepted_name      TEXT,
  accepted_option_id INTEGER,
  declined_at        TEXT,
  decline_reason     TEXT,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);

-- Every quote has at least one option. Good/better/best = several options.
CREATE TABLE IF NOT EXISTS quote_options (
  id          INTEGER PRIMARY KEY,
  quote_id    INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  recommended INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_quote_options_quote ON quote_options(quote_id);

CREATE TABLE IF NOT EXISTS quote_lines (
  id               INTEGER PRIMARY KEY,
  option_id        INTEGER NOT NULL REFERENCES quote_options(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  description      TEXT    NOT NULL,
  quantity_x100    INTEGER NOT NULL DEFAULT 100,
  unit             TEXT    NOT NULL DEFAULT 'each',
  unit_price_pence INTEGER,               -- NULL while needs_price
  price_item_id    INTEGER REFERENCES price_items(id) ON DELETE SET NULL,
  needs_price      INTEGER NOT NULL DEFAULT 0,
  line_total_pence INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_quote_lines_option ON quote_lines(option_id);

-- Audit trail: who did what and when (views, acceptance with typed name, etc.).
CREATE TABLE IF NOT EXISTS quote_events (
  id         INTEGER PRIMARY KEY,
  quote_id   INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL
             CHECK (type IN ('created', 'sent', 'viewed', 'accepted', 'declined', 'question', 'nudged', 'expired')),
  actor      TEXT    NOT NULL CHECK (actor IN ('owner', 'customer', 'system')),
  detail     TEXT    NOT NULL DEFAULT '{}',  -- JSON
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_quote_events_quote ON quote_events(quote_id);

-- "Ask a question" from customers, and replies.
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY,
  quote_id   INTEGER REFERENCES quotes(id) ON DELETE CASCADE,
  job_id     INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  sender     TEXT    NOT NULL CHECK (sender IN ('customer', 'owner')),
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jobs (
  id                      INTEGER PRIMARY KEY,
  number                  INTEGER NOT NULL,
  ref                     TEXT    NOT NULL UNIQUE,
  quote_id                INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  option_id               INTEGER,
  customer_id             INTEGER NOT NULL REFERENCES customers(id),
  title                   TEXT    NOT NULL DEFAULT '',
  status                  TEXT    NOT NULL DEFAULT 'to_book'
                                  CHECK (status IN ('to_book', 'booked', 'in_progress', 'done')),
  start_date              TEXT,
  end_date                TEXT,
  notes                   TEXT    NOT NULL DEFAULT '',
  vat_registered          INTEGER NOT NULL DEFAULT 1,
  vat_rate_bp             INTEGER NOT NULL DEFAULT 2000,
  deposit_due_pence       INTEGER NOT NULL DEFAULT 0,
  public_token            TEXT    NOT NULL UNIQUE,
  signed_off_at           TEXT,
  signoff_name            TEXT,
  signature_attachment_id INTEGER REFERENCES attachments(id) ON DELETE SET NULL,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at            TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- A copy of the accepted quote option's lines, so price list changes never alter a job.
CREATE TABLE IF NOT EXISTS job_lines (
  id               INTEGER PRIMARY KEY,
  job_id           INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  description      TEXT    NOT NULL,
  quantity_x100    INTEGER NOT NULL DEFAULT 100,
  unit             TEXT    NOT NULL DEFAULT 'each',
  unit_price_pence INTEGER NOT NULL DEFAULT 0,
  price_item_id    INTEGER,
  line_total_pence INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_job_lines_job ON job_lines(job_id);

CREATE TABLE IF NOT EXISTS job_team (
  job_id         INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  PRIMARY KEY (job_id, team_member_id)
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id         INTEGER PRIMARY KEY,
  job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  text       TEXT    NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  done_at    TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Extra work found during a job; the customer approves via a link.
CREATE TABLE IF NOT EXISTS variations (
  id               INTEGER PRIMARY KEY,
  job_id           INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  description      TEXT    NOT NULL,
  quantity_x100    INTEGER NOT NULL DEFAULT 100,
  unit             TEXT    NOT NULL DEFAULT 'item',
  unit_price_pence INTEGER NOT NULL DEFAULT 0,
  total_pence      INTEGER NOT NULL DEFAULT 0,  -- before VAT
  status           TEXT    NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'sent', 'approved', 'declined')),
  public_token     TEXT    NOT NULL UNIQUE,
  sent_at          TEXT,
  approved_at      TEXT,
  approved_name    TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Invoices and money in
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoices (
  id                     INTEGER PRIMARY KEY,
  number                 INTEGER NOT NULL,
  ref                    TEXT    NOT NULL UNIQUE,
  job_id                 INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  customer_id            INTEGER NOT NULL REFERENCES customers(id),
  -- "overdue" isn't stored: it's worked out from due_date and the amount still owed.
  status                 TEXT    NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft', 'sent', 'viewed', 'part_paid', 'paid', 'void')),
  issue_date             TEXT    NOT NULL,
  due_date               TEXT    NOT NULL,
  payment_terms_days     INTEGER NOT NULL DEFAULT 14,
  payment_reference      TEXT    NOT NULL,
  vat_registered         INTEGER NOT NULL DEFAULT 1,
  vat_rate_bp            INTEGER NOT NULL DEFAULT 2000,
  subtotal_pence         INTEGER NOT NULL DEFAULT 0,
  vat_pence              INTEGER NOT NULL DEFAULT 0,
  total_pence            INTEGER NOT NULL DEFAULT 0,
  deposit_deducted_pence INTEGER NOT NULL DEFAULT 0,
  amount_due_pence       INTEGER NOT NULL DEFAULT 0,  -- total minus deposit already paid
  public_token           TEXT    NOT NULL UNIQUE,
  reminders_on           INTEGER NOT NULL DEFAULT 1,
  sent_at                TEXT,
  viewed_at              TEXT,
  paid_at                TEXT,
  created_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id               INTEGER PRIMARY KEY,
  invoice_id       INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  source           TEXT    NOT NULL DEFAULT 'job_line' CHECK (source IN ('job_line', 'variation', 'manual')),
  description      TEXT    NOT NULL,
  quantity_x100    INTEGER NOT NULL DEFAULT 100,
  unit             TEXT    NOT NULL DEFAULT 'each',
  unit_price_pence INTEGER NOT NULL DEFAULT 0,
  line_total_pence INTEGER NOT NULL DEFAULT 0
);

-- Deposits (job_id set, invoice_id empty) and invoice payments (full or part).
CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY,
  job_id       INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  invoice_id   INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  kind         TEXT    NOT NULL CHECK (kind IN ('deposit', 'invoice')),
  amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
  method       TEXT    NOT NULL CHECK (method IN ('bank_transfer', 'cash', 'card')),
  paid_on      TEXT    NOT NULL,
  note         TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS reminders (
  id            INTEGER PRIMARY KEY,
  invoice_id    INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  stage         TEXT    NOT NULL CHECK (stage IN ('before_3', 'due', 'overdue_7', 'overdue_14')),
  scheduled_for TEXT    NOT NULL,  -- YYYY-MM-DD
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'cancelled')),
  sent_at       TEXT,
  outbox_id     INTEGER,
  UNIQUE (invoice_id, stage)
);

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------

-- Placeholders like {{customer_name}}, {{link}}, {{amount}} are filled in when sending.
CREATE TABLE IF NOT EXISTS message_templates (
  key     TEXT PRIMARY KEY,
  label   TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
  subject TEXT NOT NULL DEFAULT '',
  body    TEXT NOT NULL
);

-- Every simulated email/SMS. A real provider can replace the simulated sender later.
CREATE TABLE IF NOT EXISTS outbox (
  id           INTEGER PRIMARY KEY,
  channel      TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  to_name      TEXT NOT NULL DEFAULT '',
  to_address   TEXT NOT NULL,
  subject      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL,
  links        TEXT NOT NULL DEFAULT '[]',  -- JSON array of { label, url }
  template_key TEXT,
  related_type TEXT,
  related_id   INTEGER,
  status       TEXT NOT NULL DEFAULT 'simulated',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- In-app notifications for the owner ("Mrs Hirst accepted Q-0012").
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
