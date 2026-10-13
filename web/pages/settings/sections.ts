import type { IconName } from '../../components/Icon';
import type { Business } from '../../types';

export type FieldType = 'text' | 'email' | 'tel' | 'textarea' | 'toggle' | 'int' | 'percent' | 'postcode';

export interface FieldDef {
  key: keyof Business;
  label: string;
  type?: FieldType;
  hint?: string;
  optional?: boolean;
  placeholder?: string;
  suffix?: string;
  /** Show only when another toggle is on. */
  showIf?: keyof Business;
  /** Lay out with the next field side by side on wider screens. */
  pair?: boolean;
}

export interface SectionDef {
  id: string;
  title: string;
  summary: string;
  icon: IconName;
  fields?: FieldDef[];
  custom?: 'branding' | 'team';
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'business',
    title: 'Business details',
    summary: 'Name, address and contact details on your quotes and invoices',
    icon: 'building',
    fields: [
      { key: 'name', label: 'Business name' },
      { key: 'owner_name', label: 'Your name', hint: 'Used to sign off messages to customers' },
      { key: 'trade', label: 'What you do', hint: 'e.g. plastering and general building. Helps the AI price your quotes.', optional: true },
      { key: 'address_line1', label: 'Address', optional: true },
      { key: 'address_line2', label: 'Address line 2', optional: true },
      { key: 'town', label: 'Town', optional: true, pair: true },
      { key: 'postcode', label: 'Postcode', type: 'postcode', optional: true },
      { key: 'phone', label: 'Phone', type: 'tel', optional: true, pair: true },
      { key: 'email', label: 'Email', type: 'email', optional: true },
      { key: 'website', label: 'Website', optional: true },
    ],
  },
  {
    id: 'branding',
    title: 'Logo and colours',
    summary: 'How your app, quotes and customer pages look',
    icon: 'palette',
    custom: 'branding',
  },
  {
    id: 'vat',
    title: 'VAT',
    summary: 'Whether you charge VAT, and your VAT number',
    icon: 'percent',
    fields: [
      { key: 'vat_registered', label: 'I’m VAT registered', type: 'toggle', hint: 'Turn off if you don’t charge VAT. Quotes and invoices will show no VAT.' },
      { key: 'vat_number', label: 'VAT number', showIf: 'vat_registered', placeholder: 'GB 123 4567 89' },
      { key: 'vat_rate_bp', label: 'VAT rate', type: 'percent', suffix: '%', showIf: 'vat_registered', hint: 'Standard rate is 20%' },
    ],
  },
  {
    id: 'bank',
    title: 'Bank details',
    summary: 'Shown on invoices so customers can pay you',
    icon: 'bank',
    fields: [
      { key: 'account_name', label: 'Account name' },
      { key: 'bank_name', label: 'Bank', optional: true },
      { key: 'sort_code', label: 'Sort code', placeholder: '12-34-56', pair: true },
      { key: 'account_number', label: 'Account number', placeholder: '12345678' },
    ],
  },
  {
    id: 'quotes',
    title: 'Quotes and invoices',
    summary: 'Validity, deposits, payment terms and your terms and conditions',
    icon: 'file',
    fields: [
      { key: 'default_validity_days', label: 'Quotes are valid for', type: 'int', suffix: 'days', pair: true },
      { key: 'default_deposit_bp', label: 'Usual deposit', type: 'percent', suffix: '%', hint: 'Set to 0 for no deposit' },
      { key: 'payment_terms_days', label: 'Invoices are due within', type: 'int', suffix: 'days', hint: 'Set to 0 for “due on receipt”' },
      { key: 'reminders_default_on', label: 'Send payment reminders automatically', type: 'toggle', hint: 'Polite reminders before and after the due date. You can switch them off for any invoice.' },
      { key: 'quote_terms', label: 'Terms and conditions', type: 'textarea', hint: 'Shown at the bottom of every quote. One point per line.', optional: true },
    ],
  },
  {
    id: 'numbering',
    title: 'Numbering',
    summary: 'How your quotes, jobs and invoices are numbered',
    icon: 'hash',
    fields: [
      { key: 'quote_prefix', label: 'Quote prefix', placeholder: 'Q-', pair: true },
      { key: 'quote_next', label: 'Next quote number', type: 'int' },
      { key: 'job_prefix', label: 'Job prefix', placeholder: 'J-', pair: true },
      { key: 'job_next', label: 'Next job number', type: 'int' },
      { key: 'invoice_prefix', label: 'Invoice prefix', placeholder: 'INV-', pair: true },
      { key: 'invoice_next', label: 'Next invoice number', type: 'int' },
    ],
  },
  {
    id: 'team',
    title: 'Team',
    summary: 'People you can put on jobs',
    icon: 'users',
    custom: 'team',
  },
];
