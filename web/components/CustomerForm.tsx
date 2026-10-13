import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import type { Customer } from '../types';
import { useToast } from './toast';
import { Banner, Button, TextArea, TextField } from './ui';

export type CustomerDraft = Pick<
  Customer,
  'name' | 'phone' | 'email' | 'address_line1' | 'address_line2' | 'town' | 'postcode' | 'notes'
>;

export const emptyCustomer: CustomerDraft = {
  name: '',
  phone: '',
  email: '',
  address_line1: '',
  address_line2: '',
  town: '',
  postcode: '',
  notes: '',
};

/** The customer fields on their own, so they can sit inside other forms (e.g. a new enquiry). */
export function CustomerFields({
  value,
  onChange,
  errors = {},
  showNotes = true,
  autoFocus,
}: {
  value: CustomerDraft;
  onChange: (value: CustomerDraft) => void;
  errors?: Record<string, string>;
  showNotes?: boolean;
  autoFocus?: boolean;
}) {
  const set = (key: keyof CustomerDraft) => (v: string) => onChange({ ...value, [key]: v });
  return (
    <>
      <TextField label="Name" value={value.name} onChange={set('name')} error={errors.name} autoComplete="off" autoFocus={autoFocus} />
      <div className="form-row cols-2">
        <TextField label="Phone" type="tel" inputMode="tel" value={value.phone} onChange={set('phone')} error={errors.phone} optional autoComplete="off" />
        <TextField label="Email" type="email" inputMode="email" value={value.email} onChange={set('email')} error={errors.email} optional autoComplete="off" />
      </div>
      <TextField label="Address" value={value.address_line1} onChange={set('address_line1')} error={errors.address_line1} optional placeholder="House number and street" autoComplete="off" />
      <TextField label="Address line 2" value={value.address_line2} onChange={set('address_line2')} error={errors.address_line2} optional placeholder="Village or area" autoComplete="off" />
      <div className="form-row cols-2">
        <TextField label="Town" value={value.town} onChange={set('town')} error={errors.town} optional autoComplete="off" />
        <TextField label="Postcode" value={value.postcode} onChange={set('postcode')} error={errors.postcode} optional autoCapitalize="characters" autoComplete="off" />
      </div>
      {showNotes && (
        <TextArea label="Notes" value={value.notes} onChange={set('notes')} error={errors.notes} optional rows={2} placeholder="Parking, pets, best time to call…" />
      )}
    </>
  );
}

/** Add or edit a customer. */
export function CustomerForm({
  customer,
  onSaved,
  onCancel,
}: {
  customer?: Customer;
  onSaved: (customer: Customer) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<CustomerDraft>(customer ? { ...emptyCustomer, ...customer } : emptyCustomer);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    try {
      const fields: CustomerDraft = {
        name: draft.name,
        phone: draft.phone,
        email: draft.email,
        address_line1: draft.address_line1,
        address_line2: draft.address_line2,
        town: draft.town,
        postcode: draft.postcode,
        notes: draft.notes,
      };
      const saved = customer
        ? await api.put<Customer>(`/api/customers/${customer.id}`, fields)
        : await api.post<Customer>('/api/customers', fields);
      toast(customer ? 'Customer updated' : `${saved.name} added`);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      {error && <Banner>{error}</Banner>}
      <CustomerFields value={draft} onChange={setDraft} errors={errors} autoFocus={!customer} />
      <div className="form-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {customer ? 'Save changes' : 'Add customer'}
        </Button>
      </div>
    </form>
  );
}
