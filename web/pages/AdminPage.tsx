import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../api';
import { Icon } from '../components/Icon';
import { useToast } from '../components/toast';
import { Banner, BrandMark, Button, PageHeader, Pill, Sheet, Spinner, TextField } from '../components/ui';
import { useBusiness } from '../session';
import type { PriceItem, TeamMember, User } from '../types';

/** For the agency: a checklist for setting up a new client, plus their logins. */
export function AdminPage() {
  const business = useBusiness();
  const [prices, setPrices] = useState<PriceItem[] | null>(null);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [users, setUsers] = useState<User[] | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get<PriceItem[]>('/api/price-items'), api.get<TeamMember[]>('/api/team'), api.get<User[]>('/api/admin/users')])
      .then(([p, t, u]) => {
        setPrices(p);
        setTeam(t);
        setUsers(u);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <Banner>{error}</Banner>;
  if (!prices || !team || !users) return <Spinner />;

  const activePrices = prices.filter((p) => p.active).length;
  const checks = [
    { done: Boolean(business.name && business.phone && business.address_line1), label: 'Business name, address and phone', to: '/settings/business' },
    { done: Boolean(business.logo_url), label: 'Logo uploaded', to: '/settings/branding' },
    { done: business.brand_colour.toLowerCase() !== '#1f5f8b', label: 'Brand colour chosen', to: '/settings/branding' },
    { done: !business.vat_registered || Boolean(business.vat_number), label: business.vat_registered ? 'VAT number added' : 'VAT: not registered', to: '/settings/vat' },
    { done: Boolean(business.account_name && business.sort_code && business.account_number), label: 'Bank details for invoices', to: '/settings/bank' },
    { done: activePrices >= 5, label: `Price list (${activePrices} item${activePrices === 1 ? '' : 's'})`, to: '/price-list' },
    { done: Boolean(business.quote_terms.trim()), label: 'Quote terms and conditions', to: '/settings/quotes' },
    { done: team.length > 0, label: `Team (${team.length})`, to: '/settings/team' },
  ];
  const doneCount = checks.filter((c) => c.done).length;

  return (
    <>
      <PageHeader title="Client setup" subtitle="For the setup team. Get a new client ready in one sitting." />

      <div className="card card-pad" style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
        <BrandMark name={business.name} logoUrl={business.logo_url} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="strong">{business.name}</div>
          <div className="small muted">
            {doneCount} of {checks.length} setup steps done
          </div>
        </div>
        <Pill kind={doneCount === checks.length ? 'ok' : 'warn'}>{doneCount === checks.length ? 'Ready' : 'In progress'}</Pill>
      </div>

      <h2 className="section-title">Setup checklist</h2>
      <ul className="list card checklist-admin">
        {checks.map((c) => (
          <li key={c.label}>
            <Link to={c.to} className="list-row">
              <span className={`check-dot${c.done ? ' done' : ''}`}>
                <Icon name="check" size={15} strokeWidth={3} />
              </span>
              <div className="grow">
                <div className="title">{c.label}</div>
              </div>
              <span className="sr-only">{c.done ? 'Done' : 'Not done yet'}</span>
              <span className="chev">
                <Icon name="chevronRight" size={18} />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="section-title">Logins</h2>
      <ul className="list card">
        {users.map((u) => (
          <li key={u.id}>
            <button className="list-row" onClick={() => setEditing(u)}>
              <div className="grow">
                <div className="title">{u.name}</div>
                <div className="meta">{u.email}</div>
              </div>
              <Pill kind={u.role === 'agency' ? 'info' : 'brand'}>{u.role === 'agency' ? 'Setup team' : 'Owner'}</Pill>
              <span className="chev">
                <Icon name="chevronRight" size={18} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="small muted" style={{ marginTop: 16 }}>
        Tip: to rebrand for a new client, work down the checklist, then give the owner their login. See the README for the full steps.
      </p>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Edit login">
        {editing && (
          <UserForm
            user={editing}
            onCancel={() => setEditing(null)}
            onSaved={(list) => {
              setUsers(list);
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function UserForm({ user, onSaved, onCancel }: { user: User; onSaved: (users: User[]) => void; onCancel: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    try {
      const list = await api.put<User[]>(`/api/admin/users/${user.id}`, { name, email, ...(password ? { password } : {}) });
      toast('Login updated');
      onSaved(list);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      {error && <Banner>{error}</Banner>}
      <TextField label="Name" value={name} onChange={setName} error={errors.name} />
      <TextField label="Email" type="email" value={email} onChange={setEmail} error={errors.email} autoComplete="off" />
      <TextField
        label="New password"
        type="password"
        value={password}
        onChange={setPassword}
        error={errors.password}
        optional
        autoComplete="new-password"
        hint="Leave blank to keep the current password. At least 8 characters."
      />
      <div className="form-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}
