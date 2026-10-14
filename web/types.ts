export interface User {
  id: number;
  email: string;
  name: string;
  role: 'owner' | 'staff' | 'agency';
}

export interface Business {
  name: string;
  trade: string;
  owner_name: string;
  address_line1: string;
  address_line2: string;
  town: string;
  postcode: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string | null;
  brand_colour: string;
  vat_registered: boolean;
  vat_number: string;
  vat_rate_bp: number;
  bank_name: string;
  account_name: string;
  sort_code: string;
  account_number: string;
  quote_terms: string;
  default_validity_days: number;
  default_deposit_bp: number;
  payment_terms_days: number;
  quote_prefix: string;
  quote_next: number;
  job_prefix: string;
  job_next: number;
  invoice_prefix: string;
  invoice_next: number;
  reminders_default_on: boolean;
  quote_next_min?: number;
  job_next_min?: number;
  invoice_next_min?: number;
}

export interface PublicBranding {
  name: string;
  brand_colour: string;
  logo_url: string | null;
  phone: string;
  email: string;
  /** Set when running as the public demo. */
  demo: { reset_hours: number } | null;
  /** False once private passwords are set on the host: the demo logins are then hidden. */
  demo_logins_visible: boolean;
}

export type Unit = 'm2' | 'm' | 'each' | 'day' | 'hour' | 'item';
export type PriceKind = 'standard' | 'markup_percent' | 'minimum_charge';

export interface PriceItem {
  id: number;
  category: string;
  name: string;
  description: string;
  unit: Unit;
  unit_price_pence: number;
  kind: PriceKind;
  rate_bp: number;
  active: boolean;
  sort_order: number;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  address_line1: string;
  address_line2: string;
  town: string;
  postcode: string;
  notes: string;
  created_at: string;
  enquiry_count?: number;
  quote_count?: number;
  job_count?: number;
  last_activity?: string;
}

export interface Photo {
  id: number;
  url: string;
  caption: string;
}

export type EnquirySource = 'phone' | 'website' | 'referral' | 'walk-in' | 'other';

export interface Enquiry {
  id: number;
  customer_id: number;
  description: string;
  source: EnquirySource;
  status: 'new' | 'quoted' | 'closed';
  received_at: string;
  customer_name?: string;
  customer_town?: string;
  photo_count?: number;
  photos?: Photo[];
}

export interface TeamMember {
  id: number;
  name: string;
  phone: string;
  role_label: string;
  active: boolean;
}

export interface CustomerDetail {
  customer: Customer;
  enquiries: Enquiry[];
  quotes: { id: number; ref: string; title: string; status: string; created_at: string }[];
  jobs: { id: number; ref: string; title: string; status: string; start_date: string | null }[];
  invoices: { id: number; ref: string; status: string; issue_date: string; total_pence: number; amount_due_pence: number }[];
}

// ---------- Quotes ----------

export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';
export type QuoteSource = 'blank' | 'text' | 'voice' | 'photo';

export interface QuoteLine {
  id?: number;
  description: string;
  quantity_x100: number;
  unit: Unit;
  unit_price_pence: number | null;
  price_item_id: number | null;
  needs_price: boolean;
  line_total_pence?: number;
}

export interface Totals {
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
  unpricedLines: number;
  depositPence: number;
}

export interface QuoteOption {
  id: number;
  name: string;
  recommended: boolean;
  lines: QuoteLine[];
  totals: Totals;
}

export interface Quote {
  id: number;
  ref: string;
  customer_id: number;
  enquiry_id: number | null;
  title: string;
  status: QuoteStatus;
  source: QuoteSource;
  brief: string;
  intro_notes: string;
  exclusions: string[];
  customer_questions: string[];
  validity_days: number;
  valid_until: string | null;
  deposit_bp: number;
  vat_registered: boolean;
  vat_rate_bp: number;
  public_token: string;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  accepted_option_id: number | null;
  declined_at: string | null;
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
  editable: boolean;
}

export interface QuoteEvent {
  id: number;
  type: string;
  actor: 'owner' | 'customer' | 'system';
  detail: Record<string, unknown>;
  created_at: string;
}

export interface QuoteMessage {
  id: number;
  sender: 'customer' | 'owner';
  body: string;
  created_at: string;
}

export interface QuoteDetail {
  quote: Quote;
  options: QuoteOption[];
  customer: Customer;
  photos: { id: number; from: string; url: string; caption: string }[];
  events: QuoteEvent[];
  messages: QuoteMessage[];
  ai?: { mode: 'claude' | 'demo'; notice: string | null; assumptions: string[]; added: number; flagged: number };
  sent?: { channel: 'email' | 'sms'; address: string };
}

export interface QuoteSummary {
  id: number;
  ref: string;
  title: string;
  status: QuoteStatus;
  customer_id: number;
  customer_name: string;
  total_pence: number;
  option_count: number;
  needs_price: boolean;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  first_viewed_at: string | null;
  accepted_at: string | null;
  valid_until: string | null;
}

export interface OutboxMessage {
  id: number;
  channel: 'email' | 'sms';
  to_name: string;
  to_address: string;
  subject: string;
  body: string;
  links: { label: string; url: string }[];
  template_key: string | null;
  related_type: string | null;
  related_id: number | null;
  created_at: string;
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface MessageTemplate {
  key: string;
  label: string;
  channel: 'email' | 'sms';
  subject: string;
  body: string;
}
