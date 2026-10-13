import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { bpToPercent, percentToBp } from '../../../shared/money';
import { api, ApiError, errorMessage } from '../../api';
import { useToast } from '../../components/toast';
import { Banner, Button, PageHeader, TextArea, TextField, Toggle } from '../../components/ui';
import { useBusiness, useSession } from '../../session';
import type { Business } from '../../types';
import { NotFoundPage } from '../NotFoundPage';
import { BrandingSettings } from './BrandingSettings';
import { SECTIONS, type FieldDef } from './sections';
import { TeamSettings } from './TeamSettings';

export function SettingsSectionPage() {
  const { section: id } = useParams();
  const section = SECTIONS.find((s) => s.id === id);
  if (!section) return <NotFoundPage />;

  return (
    <>
      <PageHeader back={{ to: '/settings', label: 'Settings' }} title={section.title} subtitle={section.summary} />
      {section.custom === 'branding' && <BrandingSettings />}
      {section.custom === 'team' && <TeamSettings />}
      {section.fields && <FieldsForm key={section.id} fields={section.fields} />}
    </>
  );
}

/** Turn a business value into what the input shows, and back. */
function toInput(field: FieldDef, value: unknown): string | boolean {
  if (field.type === 'toggle') return Boolean(value);
  if (field.type === 'percent') return bpToPercent(Number(value));
  return String(value ?? '');
}

function fromInput(field: FieldDef, value: string | boolean): { ok: true; value: unknown } | { ok: false; error: string } {
  if (field.type === 'toggle') return { ok: true, value: Boolean(value) };
  if (field.type === 'percent') {
    const bp = percentToBp(String(value));
    return bp === null ? { ok: false, error: 'Enter a percentage like 20' } : { ok: true, value: bp };
  }
  if (field.type === 'int') {
    const s = String(value).trim();
    return /^\d+$/.test(s) ? { ok: true, value: Number(s) } : { ok: false, error: 'Enter a whole number' };
  }
  return { ok: true, value: String(value) };
}

function FieldsForm({ fields }: { fields: FieldDef[] }) {
  const business = useBusiness();
  const { setBusiness } = useSession();
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, toInput(f, business[f.key])])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const dirty = fields.some((f) => draft[f.key] !== toInput(f, business[f.key]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    const local: Record<string, string> = {};
    for (const f of fields) {
      const r = fromInput(f, draft[f.key]);
      if (r.ok) body[f.key] = r.value;
      else local[f.key] = r.error;
    }
    if (Object.keys(local).length) return setErrors(local);

    setBusy(true);
    setErrors({});
    setError('');
    try {
      const saved = await api.put<Business>('/api/business', body);
      // Keep the extra info (like minimum numbers) from the full settings call.
      setBusiness({ ...business, ...saved });
      setDraft(Object.fromEntries(fields.map((f) => [f.key, toInput(f, saved[f.key])])));
      toast('Settings saved');
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Group fields marked `pair` with the next one.
  const rows: FieldDef[][] = [];
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].pair && fields[i + 1]) {
      rows.push([fields[i], fields[i + 1]]);
      i++;
    } else rows.push([fields[i]]);
  }

  const renderField = (f: FieldDef) => {
    if (f.showIf && !draft[f.showIf]) return null;
    const value = draft[f.key];
    const set = (v: string | boolean) => setDraft((d) => ({ ...d, [f.key]: v }));
    const minHint =
      f.key === 'quote_next' || f.key === 'job_next' || f.key === 'invoice_next'
        ? `Must be ${business[`${f.key}_min` as keyof Business] ?? 1} or more`
        : undefined;
    switch (f.type) {
      case 'toggle':
        return <Toggle key={f.key} label={f.label} checked={Boolean(value)} onChange={set} hint={f.hint} />;
      case 'textarea':
        return (
          <TextArea key={f.key} label={f.label} value={String(value)} onChange={set} error={errors[f.key]} hint={f.hint} optional={f.optional} rows={8} />
        );
      default:
        return (
          <TextField
            key={f.key}
            label={f.label}
            value={String(value)}
            onChange={set}
            error={errors[f.key]}
            hint={f.hint ?? minHint}
            optional={f.optional}
            placeholder={f.placeholder}
            suffix={f.suffix}
            type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
            inputMode={f.type === 'int' ? 'numeric' : f.type === 'percent' ? 'decimal' : f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : undefined}
            autoCapitalize={f.type === 'postcode' ? 'characters' : undefined}
          />
        );
    }
  };

  return (
    <form className="card card-pad form" onSubmit={submit} noValidate>
      {error && <Banner>{error}</Banner>}
      {rows.map((row) =>
        row.length === 2 ? (
          <div key={row[0].key} className="form-row cols-2">
            {row.map(renderField)}
          </div>
        ) : (
          renderField(row[0])
        ),
      )}
      <div className="form-actions">
        <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
