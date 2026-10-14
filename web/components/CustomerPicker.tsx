import { useEffect, useState } from 'react';
import { api } from '../api';
import { useDebounced } from '../hooks';
import type { Customer } from '../types';
import { CustomerFields, type CustomerDraft } from './CustomerForm';
import { Avatar, Button, SearchInput, Segmented } from './ui';

export type CustomerChoice = { kind: 'existing'; customer: Customer | null } | { kind: 'new'; draft: CustomerDraft };

/** Choose an existing customer (search) or type a new one. */
export function CustomerPicker({
  value,
  onChange,
  errors = {},
  locked,
}: {
  value: CustomerChoice;
  onChange: (value: CustomerChoice) => void;
  errors?: Record<string, string>;
  locked?: boolean;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);
  const [results, setResults] = useState<Customer[]>([]);
  const selected = value.kind === 'existing' ? value.customer : null;

  useEffect(() => {
    if (value.kind !== 'existing' || selected) return;
    let cancelled = false;
    api
      .get<Customer[]>(`/api/customers?q=${encodeURIComponent(debounced)}`)
      .then((rows) => !cancelled && setResults(rows.slice(0, 6)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [debounced, value.kind, selected]);

  return (
    <>
      {!locked && (
        <Segmented
          label="Customer"
          value={value.kind}
          onChange={(kind) =>
            onChange(
              kind === 'existing'
                ? { kind: 'existing', customer: null }
                : { kind: 'new', draft: { name: '', phone: '', email: '', address_line1: '', address_line2: '', town: '', postcode: '', notes: '' } },
            )
          }
          options={[
            { value: 'existing', label: 'Existing customer' },
            { value: 'new', label: 'New customer' },
          ]}
        />
      )}

      {value.kind === 'new' && <CustomerFields value={value.draft} onChange={(draft) => onChange({ kind: 'new', draft })} errors={errors} showNotes={false} />}

      {value.kind === 'existing' && selected && (
        <div className="list-row card" style={{ padding: '12px 14px' }}>
          <Avatar name={selected.name} />
          <div className="grow">
            <div className="title">{selected.name}</div>
            <div className="meta">{[selected.address_line1, selected.postcode].filter(Boolean).join(', ') || selected.phone || selected.email}</div>
          </div>
          {!locked && (
            <Button size="sm" variant="ghost" onClick={() => onChange({ kind: 'existing', customer: null })}>
              Change
            </Button>
          )}
        </div>
      )}

      {value.kind === 'existing' && !selected && (
        <div className="field">
          <SearchInput value={query} onChange={setQuery} label="Find a customer" placeholder="Start typing a name, phone or postcode" />
          {errors.customer_id && <span className="error">{errors.customer_id}</span>}
          {results.length > 0 && (
            <ul className="list card" style={{ marginTop: 6 }}>
              {results.map((c) => (
                <li key={c.id}>
                  <button type="button" className="list-row" onClick={() => onChange({ kind: 'existing', customer: c })}>
                    <Avatar name={c.name} />
                    <div className="grow">
                      <div className="title">{c.name}</div>
                      <div className="meta">{[c.address_line1, c.postcode].filter(Boolean).join(', ')}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
