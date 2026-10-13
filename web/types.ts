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
