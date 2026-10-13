import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { Banner, BrandMark, Button, TextField } from '../components/ui';
import { useSession } from '../session';
import type { User } from '../types';

export function LoginPage() {
  const { branding, setUser, refreshBusiness } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const { user } = await api.post<{ user: User }>('/api/auth/login', { email, password });
      await refreshBusiness();
      setUser(user);
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        if (!Object.keys(err.fields).length) setError(err.message);
      } else setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const name = branding?.name ?? 'Quote to Paid';

  return (
    <div className="login-page">
      <main className="card login-card">
        <div className="brand-row">
          <BrandMark name={name} logoUrl={branding?.logo_url ?? null} size={48} />
          <div>
            <h1 style={{ fontSize: '1.2rem' }}>{name}</h1>
            <p className="small muted">Quotes, jobs and invoices</p>
          </div>
        </div>
        <form className="form" onSubmit={submit} noValidate>
          {error && <Banner>{error}</Banner>}
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={setEmail}
            error={fields.email}
            autoFocus
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            error={fields.password}
          />
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            Log in
          </Button>
        </form>
        <div className="login-hint">
          <strong>Demo logins</strong>
          <br />
          Owner: gary@example.com / demo1234
          <br />
          Setup team: admin@example.com / agency1234
        </div>
      </main>
    </div>
  );
}
