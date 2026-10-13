import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { PageHeader } from '../components/ui';
import { useSession } from '../session';

/** Phone-only menu for everything that isn't in the bottom bar. */
export function MorePage() {
  const { user, logout } = useSession();
  const items: { to: string; label: string; sub: string; icon: IconName }[] = [
    { to: '/customers', label: 'Customers', sub: 'Everyone you’ve worked for', icon: 'users' },
    { to: '/price-list', label: 'Price list', sub: 'Your rates and materials', icon: 'list' },
    { to: '/outbox', label: 'Outbox', sub: 'Messages sent to customers', icon: 'inbox' },
    { to: '/settings', label: 'Settings', sub: 'Business details, branding, VAT, bank', icon: 'settings' },
  ];
  if (user?.role === 'agency') items.push({ to: '/admin', label: 'Client setup', sub: 'For the setup team', icon: 'shield' });

  return (
    <>
      <PageHeader title="More" />
      <ul className="list card more-menu">
        {items.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="list-row">
              <span className="icon-tile">
                <Icon name={i.icon} />
              </span>
              <div className="grow">
                <div className="title">{i.label}</div>
                <div className="meta">{i.sub}</div>
              </div>
              <span className="chev">
                <Icon name="chevronRight" size={18} />
              </span>
            </Link>
          </li>
        ))}
        <li>
          <button className="list-row" onClick={logout}>
            <span className="icon-tile">
              <Icon name="logout" />
            </span>
            <div className="grow">
              <div className="title">Log out</div>
              <div className="meta">Logged in as {user?.email}</div>
            </div>
          </button>
        </li>
      </ul>
    </>
  );
}
