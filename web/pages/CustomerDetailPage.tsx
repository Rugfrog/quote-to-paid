import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { formatAgo, formatDate } from '../../shared/format';
import { api, errorMessage } from '../api';
import { CustomerForm } from '../components/CustomerForm';
import { Icon } from '../components/Icon';
import { Banner, Button, ButtonLink, EmptyState, PageHeader, Pill, Sheet, Spinner } from '../components/ui';
import type { CustomerDetail, Enquiry } from '../types';

const SOURCE_LABELS: Record<string, string> = {
  phone: 'Phone call',
  website: 'Website',
  referral: 'Recommended',
  'walk-in': 'In person',
  other: 'Other',
};

const STATUS_PILLS: Record<Enquiry['status'], { label: string; kind: 'brand' | 'ok' | undefined }> = {
  new: { label: 'New', kind: 'brand' },
  quoted: { label: 'Quoted', kind: 'ok' },
  closed: { label: 'Closed', kind: undefined },
};

export function CustomerDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api
      .get<CustomerDetail>(`/api/customers/${id}`)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  useEffect(load, [load]);

  if (error) return <Banner>{error}</Banner>;
  if (!data) return <Spinner />;

  const c = data.customer;
  const address = [c.address_line1, c.address_line2, c.town, c.postcode].filter(Boolean);
  const mapQuery = encodeURIComponent([c.address_line1, c.postcode].filter(Boolean).join(', '));
  const phoneDigits = c.phone.replace(/\s/g, '');

  return (
    <>
      <PageHeader
        back={{ to: '/customers', label: 'Customers' }}
        title={c.name}
        subtitle={`Customer since ${formatDate(c.created_at)}`}
        actions={
          <Button icon="edit" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      />

      <div className="contact-actions" style={{ marginBottom: 14 }}>
        {c.phone ? (
          <a href={`tel:${phoneDigits}`}>
            <Icon name="phone" /> Call
          </a>
        ) : (
          <span className="disabled">
            <Icon name="phone" /> Call
          </span>
        )}
        {c.phone ? (
          <a href={`sms:${phoneDigits}`}>
            <Icon name="message" /> Text
          </a>
        ) : (
          <span className="disabled">
            <Icon name="message" /> Text
          </span>
        )}
        {c.email ? (
          <a href={`mailto:${c.email}`}>
            <Icon name="mail" /> Email
          </a>
        ) : (
          <span className="disabled">
            <Icon name="mail" /> Email
          </span>
        )}
        {address.length ? (
          <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer">
            <Icon name="map" /> Map
          </a>
        ) : (
          <span className="disabled">
            <Icon name="map" /> Map
          </span>
        )}
      </div>

      <div className="grid-2">
        <section className="card card-pad" aria-labelledby="details-h">
          <h2 id="details-h" style={{ marginBottom: 14 }}>
            Details
          </h2>
          <dl className="dl">
            <dt>Phone</dt>
            <dd>{c.phone || <span className="muted">Not given</span>}</dd>
            <dt>Email</dt>
            <dd>{c.email || <span className="muted">Not given</span>}</dd>
            <dt>Address</dt>
            <dd>{address.length ? address.map((line) => <div key={line}>{line}</div>) : <span className="muted">Not given</span>}</dd>
            {c.notes && (
              <>
                <dt>Notes</dt>
                <dd className="pre-line">{c.notes}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="card card-pad" aria-labelledby="history-h">
          <h2 id="history-h" style={{ marginBottom: 14 }}>
            Work with {c.name.split(' ')[0]}
          </h2>
          <dl className="dl">
            <dt>Enquiries</dt>
            <dd>{data.enquiries.length}</dd>
            <dt>Quotes</dt>
            <dd>{data.quotes.length}</dd>
            <dt>Jobs</dt>
            <dd>{data.jobs.length}</dd>
            <dt>Invoices</dt>
            <dd>{data.invoices.length}</dd>
          </dl>
        </section>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 28, marginBottom: 10 }}>
        <h2 style={{ fontSize: '1.05rem' }}>
          Enquiries
        </h2>
        <ButtonLink to={`/enquiries/new?customer=${c.id}`} icon="plus" size="sm">
          New enquiry
        </ButtonLink>
      </div>

      {data.enquiries.length === 0 ? (
        <div className="card">
          <EmptyState icon="inbox" title="No enquiries yet">
            Log an enquiry when {c.name.split(' ')[0]} asks about a job.
          </EmptyState>
        </div>
      ) : (
        <ul className="list card">
          {data.enquiries.map((e) => (
            <li key={e.id} style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <Pill kind={STATUS_PILLS[e.status].kind}>{STATUS_PILLS[e.status].label}</Pill>
                <span className="small muted">
                  {SOURCE_LABELS[e.source]} · {formatDate(e.received_at)} ({formatAgo(e.received_at)})
                </span>
              </div>
              <p className="pre-line">{e.description}</p>
              {e.photos && e.photos.length > 0 && (
                <div className="photo-grid">
                  {e.photos.map((p) => (
                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="photo">
                      <img src={p.url} alt={p.caption || 'Enquiry photo'} loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-title" style={{ marginTop: 28 }}>
        Quotes, jobs and invoices
      </h2>
      <div className="card">
        <EmptyState icon="quote" title="Nothing here yet">
          Quotes, jobs and invoices for {c.name.split(' ')[0]} will show here once they’re created.
        </EmptyState>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit customer">
        <CustomerForm
          customer={c}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      </Sheet>
    </>
  );
}
