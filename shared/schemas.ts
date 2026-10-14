/**
 * Input rules shared by the server (which always checks) and the web app (which
 * checks early to give quick feedback). Error messages are shown to people, so
 * they're written in plain English.
 */
import { z } from 'zod';
import { isHexColour } from './colour';
import { formatPhone, formatPostcode, isValidPostcode, isValidUkPhone } from './format';

const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);
const required = (label: string, max = 200) =>
  z.string().trim().min(1, `Please enter ${label}`).max(max, `Keep this under ${max} characters`);

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === '' || z.string().email().safeParse(v).success, 'That email address doesn’t look right')
  .default('');

const optionalPhone = z
  .string()
  .trim()
  .max(40)
  .refine((v) => v === '' || isValidUkPhone(v), 'That phone number doesn’t look right')
  .transform((v) => (v === '' ? '' : formatPhone(v)))
  .default('');

const optionalPostcode = z
  .string()
  .trim()
  .max(10)
  .refine((v) => v === '' || isValidPostcode(v), 'That isn’t a valid UK postcode')
  .transform((v) => (v === '' ? '' : formatPostcode(v)))
  .default('');

const pence = z.number({ invalid_type_error: 'Please enter an amount' }).int().min(0, 'Can’t be negative').max(100_000_000);
const basisPoints = z.number().int().min(0).max(10000, 'Must be 100% or less');
const boolInt = z.boolean();

export const UNITS = ['m2', 'm', 'each', 'day', 'hour', 'item'] as const;
export const PRICE_KINDS = ['standard', 'markup_percent', 'minimum_charge'] as const;
export const ENQUIRY_SOURCES = ['phone', 'website', 'referral', 'walk-in', 'other'] as const;
export const ENQUIRY_STATUSES = ['new', 'quoted', 'closed'] as const;

// ---------- Auth ----------

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter your email address'),
  password: z.string().min(1, 'Please enter your password').max(200),
});

// ---------- Business settings ----------

export const businessSchema = z.object({
  name: required('the business name'),
  trade: text(80),
  owner_name: text(120),
  address_line1: text(120),
  address_line2: text(120),
  town: text(80),
  postcode: optionalPostcode,
  phone: optionalPhone,
  email: optionalEmail,
  website: text(200),
  brand_colour: z.string().refine(isHexColour, 'Pick a colour like #1f5f8b'),
  vat_registered: boolInt,
  vat_number: text(30),
  vat_rate_bp: basisPoints,
  bank_name: text(80),
  account_name: text(120),
  sort_code: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{2}-?\d{2}-?\d{2}$/.test(v), 'Sort codes look like 12-34-56')
    .transform((v) => (v === '' ? '' : v.replace(/\D/g, '').replace(/(\d{2})(\d{2})(\d{2})/, '$1-$2-$3'))),
  account_number: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{8}$/.test(v), 'Account numbers are 8 digits'),
  quote_terms: text(8000),
  default_validity_days: z.number().int().min(1, 'At least 1 day').max(365),
  default_deposit_bp: basisPoints,
  payment_terms_days: z.number().int().min(0).max(120),
  quote_prefix: text(10),
  quote_next: z.number().int().min(1).max(999999),
  job_prefix: text(10),
  job_next: z.number().int().min(1).max(999999),
  invoice_prefix: text(10),
  invoice_next: z.number().int().min(1).max(999999),
  reminders_default_on: boolInt,
});

export const businessUpdateSchema = businessSchema.partial();
export type BusinessInput = z.infer<typeof businessSchema>;

// ---------- Price list ----------

export const priceItemSchema = z
  .object({
    category: required('a category', 60),
    name: required('a name', 120),
    description: text(500).default(''),
    unit: z.enum(UNITS, { errorMap: () => ({ message: 'Pick a unit' }) }),
    unit_price_pence: pence,
    kind: z.enum(PRICE_KINDS).default('standard'),
    rate_bp: basisPoints.default(0),
    active: boolInt.default(true),
  })
  .refine((v) => v.kind !== 'markup_percent' || v.rate_bp > 0, {
    message: 'Enter the markup percentage',
    path: ['rate_bp'],
  });

export type PriceItemInput = z.infer<typeof priceItemSchema>;

export const priceImportSchema = z.object({
  csv: z.string().min(1, 'The file is empty').max(500_000, 'That file is too big'),
  mode: z.enum(['preview', 'import']),
  replace: z.boolean().default(false),
});

export const reorderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
});

// ---------- Customers & enquiries ----------

export const customerSchema = z.object({
  name: required('the customer’s name', 120),
  phone: optionalPhone,
  email: optionalEmail,
  address_line1: text(120).default(''),
  address_line2: text(120).default(''),
  town: text(80).default(''),
  postcode: optionalPostcode,
  notes: text(2000).default(''),
});

export type CustomerInput = z.infer<typeof customerSchema>;

export const enquirySchema = z
  .object({
    customer_id: z.number().int().positive().optional(),
    customer: customerSchema.optional(),
    description: required('a short description of the job', 4000),
    source: z.enum(ENQUIRY_SOURCES).default('phone'),
  })
  .refine((v) => v.customer_id !== undefined || v.customer !== undefined, {
    message: 'Choose a customer or add a new one',
    path: ['customer_id'],
  });

export const enquiryUpdateSchema = z.object({
  description: required('a short description of the job', 4000).optional(),
  source: z.enum(ENQUIRY_SOURCES).optional(),
  status: z.enum(ENQUIRY_STATUSES).optional(),
});

// ---------- Team & users ----------

export const teamMemberSchema = z.object({
  name: required('a name', 120),
  phone: optionalPhone,
  role_label: text(60).default(''),
  active: boolInt.default(true),
});

export const userUpdateSchema = z.object({
  name: required('a name', 120).optional(),
  email: z.string().trim().toLowerCase().email('That email address doesn’t look right').optional(),
  password: z.string().min(8, 'Use at least 8 characters').max(200).optional(),
});

// ---------- Quotes ----------

export const QUOTE_SOURCES = ['blank', 'text', 'voice', 'photo'] as const;

export const quoteLineSchema = z
  .object({
    description: required('a description', 500),
    quantity_x100: z.number().int().min(1, 'Quantity must be more than 0').max(10_000_000),
    unit: z.enum(UNITS),
    unit_price_pence: pence.nullable(),
    price_item_id: z.number().int().positive().nullable().default(null),
    needs_price: z.boolean().default(false),
  })
  .refine((l) => l.needs_price || l.unit_price_pence !== null, {
    message: 'Enter a price',
    path: ['unit_price_pence'],
  });

export const quoteOptionSchema = z.object({
  name: text(80).default(''),
  recommended: z.boolean().default(false),
  lines: z.array(quoteLineSchema).max(100, 'That’s a lot of lines: 100 is the most'),
});

export const quoteSaveSchema = z.object({
  title: text(120),
  intro_notes: text(2000),
  exclusions: z.array(text(200)).max(30),
  validity_days: z.number().int().min(1, 'At least 1 day').max(365),
  deposit_bp: basisPoints,
  options: z.array(quoteOptionSchema).min(1).max(3, 'Up to 3 options (good, better, best)'),
});

export type QuoteSaveInput = z.infer<typeof quoteSaveSchema>;

export const quoteCreateSchema = z.object({
  customer_id: z.number().int().positive(),
  enquiry_id: z.number().int().positive().nullable().default(null),
  source: z.enum(QUOTE_SOURCES).default('blank'),
  brief: text(4000).default(''),
  title: text(120).default(''),
});

export const aiFillSchema = z.object({
  brief: text(4000).optional(),
});

export const acceptQuoteSchema = z.object({
  name: required('your name', 120),
  agreed: z.literal(true, { errorMap: () => ({ message: 'Please tick the box to accept' }) }),
  option_id: z.number().int().positive().optional(),
});

export const declineQuoteSchema = z.object({
  reason: text(1000).default(''),
});

export const questionSchema = z.object({
  message: required('your question', 2000),
});

export const replySchema = z.object({
  body: required('a message', 2000),
});

export const templateSchema = z.object({
  subject: text(200),
  body: required('the message', 4000),
});

/** Turn a zod error into { field: message } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
