import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../session';
import { Icon, type IconName } from './Icon';
import { NotificationsBell } from './NotificationsBell';
import { BrandMark, Button, Sheet } from './ui';

const mainNav: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/quotes', label: 'Quotes', icon: 'quote' },
  { to: '/jobs', label: 'Jobs', icon: 'jobs' },
  { to: '/money', label: 'Money', icon: 'money' },
];

const secondaryNav: { to: string; label: string; icon: IconName }[] = [
  { to: '/customers', label: 'Customers', icon: 'users' },
  { to: '/price-list', label: 'Price list', icon: 'list' },
  { to: '/outbox', label: 'Outbox', icon: 'inbox' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { business, user, logout } = useSession();
  const [newOpen, setNewOpen] = useState(false);
  const location = useLocation();
  const b = business!;

  const isActive = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <nav className="sidebar" aria-label="Main">
        <Link to="/" className="sidebar-brand" style={{ color: 'inherit', textDecoration: 'none' }}>
          <BrandMark name={b.name} logoUrl={b.logo_url} size={40} />
          <span>{b.name}</span>
        </Link>
        <Button variant="primary" icon="plus" className="sidebar-new" onClick={() => setNewOpen(true)}>
          New
        </Button>
        {mainNav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-link">
            <Icon name={item.icon} /> {item.label}
          </NavLink>
        ))}
        <div className="nav-section">Business</div>
        {secondaryNav.map((item) => (
          <NavLink key={item.to} to={item.to} className="nav-link">
            <Icon name={item.icon} /> {item.label}
          </NavLink>
        ))}
        {user?.role === 'agency' && (
          <NavLink to="/admin" className="nav-link">
            <Icon name="shield" /> Client setup
          </NavLink>
        )}
        <div className="spacer" />
        <NotificationsBell className="nav-link" label />
        <div className="small muted" style={{ padding: '8px 12px' }}>
          Logged in as {user?.name}
        </div>
        <button className="nav-link" onClick={logout}>
          <Icon name="logout" /> Log out
        </button>
      </nav>

      <div className="shell-body">
        {/* Phone top bar */}
        <header className="topbar">
          <BrandMark name={b.name} logoUrl={b.logo_url} size={34} />
          <span className="brand-name">{b.name}</span>
          <NotificationsBell />
          <Link to="/customers" className="btn btn-ghost btn-icon" aria-label="Customers">
            <Icon name="users" />
          </Link>
          <Link to="/more" className="btn btn-ghost btn-icon" aria-label="More: settings, price list and outbox">
            <Icon name="menu" />
          </Link>
        </header>

        <main id="main" className="main" tabIndex={-1}>
          {children}
        </main>
      </div>

      {/* Phone bottom navigation */}
      <nav className="bottom-nav" aria-label="Main">
        {mainNav.slice(0, 2).map((item) => (
          <Link key={item.to} to={item.to} aria-current={isActive(item.to) ? 'page' : undefined}>
            <Icon name={item.icon} size={22} />
            {item.label}
          </Link>
        ))}
        <button className="nav-new" onClick={() => setNewOpen(true)} aria-label="New quote, enquiry or customer">
          <span className="fab">
            <Icon name="plus" size={26} strokeWidth={2.4} />
          </span>
        </button>
        {mainNav.slice(2).map((item) => (
          <Link key={item.to} to={item.to} aria-current={isActive(item.to) ? 'page' : undefined}>
            <Icon name={item.icon} size={22} />
            {item.label}
          </Link>
        ))}
      </nav>

      <NewSheet open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function NewSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  const options: { to: string; icon: IconName; title: string; sub: string }[] = [
    { to: '/quotes/new', icon: 'sparkle', title: 'New quote', sub: 'Say it, type it or snap it: priced in seconds' },
    { to: '/enquiries/new', icon: 'phone', title: 'New enquiry', sub: 'Someone’s been in touch about a job' },
    { to: '/customers?new=1', icon: 'user', title: 'New customer', sub: 'Add someone to your customer list' },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="What would you like to add?">
      <div className="new-sheet-options">
        {options.map((o) => (
          <button key={o.to} className="new-option" onClick={() => go(o.to)}>
            <span className="icon-tile">
              <Icon name={o.icon} />
            </span>
            <span>
              <span className="t" style={{ display: 'block' }}>
                {o.title}
              </span>
              <span className="s">{o.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
