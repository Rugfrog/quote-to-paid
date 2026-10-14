import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatAgo, formatMoney } from '../../../shared/format';
import { api, errorMessage } from '../../api';
import { Icon } from '../../components/Icon';
import { QuoteStatusPill } from '../../components/status';
import { Banner, ButtonLink, EmptyState, PageHeader, Pill, SearchInput, Spinner } from '../../components/ui';
import { useDebounced } from '../../hooks';
import type { QuoteSummary } from '../../types';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'open', label: 'Waiting' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
];

function whenText(q: QuoteSummary): string {
  if (q.status === 'accepted' && q.accepted_at) return `accepted ${formatAgo(q.accepted_at)}`;
  if (q.status === 'viewed' && q.first_viewed_at) return `opened ${formatAgo(q.first_viewed_at)}`;
  if (q.status === 'sent' && q.sent_at) return `sent ${formatAgo(q.sent_at)}`;
  return formatAgo(q.updated_at);
}

export function QuotesPage() {
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);
  const [quotes, setQuotes] = useState<QuoteSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get<QuoteSummary[]>(`/api/quotes?status=${status}&q=${encodeURIComponent(debounced)}`)
      .then((rows) => !cancelled && (setQuotes(rows), setError('')))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [status, debounced]);

  return (
    <>
      <PageHeader title="Quotes" actions={<ButtonLink to="/quotes/new" variant="primary" icon="sparkle">New quote</ButtonLink>} />

      <div className="segmented" role="group" aria-label="Show quotes" style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <label key={f.value}>
            <input type="radio" name="quote-filter" checked={status === f.value} onChange={() => setStatus(f.value)} />
            <span>{f.label}</span>
          </label>
        ))}
      </div>
      <div style={{ marginBottom: 14 }}>
        <SearchInput value={query} onChange={setQuery} label="Search quotes" placeholder="Search customer, job or number" />
      </div>

      {error && <Banner>{error}</Banner>}
      {!quotes && !error && <Spinner />}
      {quotes && quotes.length === 0 && (
        <div className="card">
          {status || debounced ? (
            <EmptyState icon="search" title="No quotes match">
              Try a different filter or search.
            </EmptyState>
          ) : (
            <EmptyState icon="quote" title="No quotes yet" action={<ButtonLink to="/quotes/new" variant="primary" icon="sparkle">Make your first quote</ButtonLink>}>
              Describe a job, record a voice note or snap a photo, and we’ll price it from your price list.
            </EmptyState>
          )}
        </div>
      )}
      {quotes && quotes.length > 0 && (
        <ul className="list card">
          {quotes.map((q) => (
            <li key={q.id}>
              <Link to={`/quotes/${q.id}`} className="list-row">
                <div className="grow">
                  <div className="title">{q.customer_name}</div>
                  <div className="meta">
                    {q.ref} · {q.title || 'Untitled quote'}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                    <QuoteStatusPill status={q.status} />
                    {q.needs_price && q.status === 'draft' && <Pill kind="warn">Check prices</Pill>}
                    <span className="tiny muted">{whenText(q)}</span>
                  </div>
                </div>
                <div className="end">
                  <div className="strong money">{formatMoney(q.total_pence)}</div>
                  {q.option_count > 1 && <div className="tiny muted">{q.option_count} options</div>}
                </div>
                <span className="chev">
                  <Icon name="chevronRight" size={18} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
