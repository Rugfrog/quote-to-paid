import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatAgo } from '../../shared/format';
import { api, errorMessage } from '../api';
import { CustomerForm } from '../components/CustomerForm';
import { Icon } from '../components/Icon';
import { Avatar, Banner, Button, EmptyState, PageHeader, SearchInput, Sheet, Spinner } from '../components/ui';
import { useDebounced } from '../hooks';
import type { Customer } from '../types';

export function CustomersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState('');
  const adding = params.get('new') === '1';

  useEffect(() => {
    let cancelled = false;
    api
      .get<Customer[]>(`/api/customers?q=${encodeURIComponent(debounced)}`)
      .then((rows) => !cancelled && (setCustomers(rows), setError('')))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const closeAdd = () => setParams({}, { replace: true });

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={customers && !debounced ? `${customers.length} customer${customers.length === 1 ? '' : 's'}` : undefined}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setParams({ new: '1' })}>
            Add customer
          </Button>
        }
      />

      <div style={{ marginBottom: 14 }}>
        <SearchInput value={query} onChange={setQuery} label="Search customers" placeholder="Search by name, phone, postcode…" />
      </div>

      {error && <Banner>{error}</Banner>}
      {!customers && !error && <Spinner />}

      {customers && customers.length === 0 && (
        <div className="card">
          {debounced ? (
            <EmptyState icon="search" title={`No one matches “${debounced}”`}>
              Try part of their name, phone number or postcode.
            </EmptyState>
          ) : (
            <EmptyState
              icon="users"
              title="No customers yet"
              action={
                <Button variant="primary" icon="plus" onClick={() => setParams({ new: '1' })}>
                  Add your first customer
                </Button>
              }
            >
              Customers are added automatically when you log an enquiry, or you can add them here.
            </EmptyState>
          )}
        </div>
      )}

      {customers && customers.length > 0 && (
        <ul className="list card">
          {customers.map((c) => (
            <li key={c.id}>
              <Link to={`/customers/${c.id}`} className="list-row">
                <Avatar name={c.name} />
                <div className="grow">
                  <div className="title">{c.name}</div>
                  <div className="meta">
                    {[c.address_line2 || c.town, c.postcode].filter(Boolean).join(', ') || c.phone || c.email || 'No contact details'}
                  </div>
                </div>
                {c.last_activity && <div className="end small muted nowrap">{formatAgo(c.last_activity)}</div>}
                <span className="chev">
                  <Icon name="chevronRight" size={18} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={adding} onClose={closeAdd} title="New customer">
        <CustomerForm onCancel={closeAdd} onSaved={(c) => navigate(`/customers/${c.id}`, { replace: true })} />
      </Sheet>
    </>
  );
}
