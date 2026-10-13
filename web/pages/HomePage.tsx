import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatAgo, formatDate } from '../../shared/format';
import { api, errorMessage } from '../api';
import { Icon, type IconName } from '../components/Icon';
import { Banner, ButtonLink, EmptyState, Spinner } from '../components/ui';
import { useBusiness, useSession } from '../session';
import type { Enquiry } from '../types';

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return 'Morning';
  if (h < 18) return 'Afternoon';
  return 'Evening';
}

export function HomePage() {
  const { user } = useSession();
  const business = useBusiness();
  const [enquiries, setEnquiries] = useState<Enquiry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Enquiry[]>('/api/enquiries?status=new')
      .then(setEnquiries)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const firstName = (user?.role === 'agency' ? business.owner_name : user?.name)?.split(' ')[0] ?? '';

  const actions: { to: string; label: string; sub: string; icon: IconName; primary?: boolean }[] = [
    { to: '/enquiries/new', label: 'New enquiry', sub: 'Log a call or message', icon: 'phone', primary: true },
    { to: '/customers', label: 'Customers', sub: 'Find anyone fast', icon: 'users' },
    { to: '/price-list', label: 'Price list', sub: 'Your rates', icon: 'list' },
    { to: '/settings', label: 'Settings', sub: 'Branding and details', icon: 'settings' },
  ];

  return (
    <>
      <div className="greeting">
        <h1>
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        <p>{formatDate(new Date())}</p>
      </div>

      <div className="quick-actions">
        {actions.map((a) => (
          <Link key={a.to} to={a.to} className={`quick-action${a.primary ? ' primary' : ''}`}>
            <span className="qa-icon">
              <Icon name={a.icon} />
            </span>
            <span>{a.label}</span>
            <span className="qa-sub">{a.sub}</span>
          </Link>
        ))}
      </div>

      <h2 className="section-title">New enquiries</h2>
      {error && <Banner>{error}</Banner>}
      {!enquiries && !error && <Spinner />}
      {enquiries && enquiries.length === 0 && (
        <div className="card">
          <EmptyState icon="inbox" title="No new enquiries" action={<ButtonLink to="/enquiries/new" variant="primary" icon="plus">Add an enquiry</ButtonLink>}>
            When someone gets in touch about a job, add it here so nothing slips through the cracks.
          </EmptyState>
        </div>
      )}
      {enquiries && enquiries.length > 0 && (
        <ul className="list card">
          {enquiries.map((e) => (
            <li key={e.id}>
              <Link to={`/customers/${e.customer_id}`} className="list-row">
                <div className="grow">
                  <div className="title">{e.customer_name}</div>
                  <div className="meta">{e.description}</div>
                </div>
                <div className="end">
                  <div className="small muted nowrap">{formatAgo(e.received_at)}</div>
                  {!!e.photo_count && (
                    <div className="tiny muted nowrap">
                      {e.photo_count} photo{e.photo_count === 1 ? '' : 's'}
                    </div>
                  )}
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
