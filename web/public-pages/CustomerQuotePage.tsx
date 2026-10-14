import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { formatDate, formatDateLong, formatMoney, unitLabel } from '../../shared/format';
import { bpToPercent, quantityToInput } from '../../shared/money';
import { api, ApiError, errorMessage } from '../api';
import { Icon } from '../components/Icon';
import { Banner, BrandMark, Button, Sheet, Spinner, TextArea, TextField } from '../components/ui';
import { applyBrand } from '../session';

interface PublicQuote {
  quote: {
    ref: string;
    title: string;
    status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';
    intro_notes: string;
    exclusions: string[];
    valid_until: string | null;
    deposit_bp: number;
    vat_registered: boolean;
    vat_rate_bp: number;
    created_at: string;
    sent_at: string | null;
    accepted_at: string | null;
    accepted_name: string | null;
    accepted_option_id: number | null;
    declined_at: string | null;
  };
  options: {
    id: number;
    name: string;
    recommended: boolean;
    totals: { subtotalPence: number; vatPence: number; totalPence: number; depositPence: number };
    lines: { id: number; description: string; quantity_x100: number; unit: string; unit_price_pence: number; line_total_pence: number }[];
  }[];
  customer: { name: string; address_line1: string; address_line2: string; town: string; postcode: string };
  business: {
    name: string;
    brand_colour: string;
    logo_url: string | null;
    phone: string;
    email: string;
    website: string;
    address: string[];
    vat_number: string;
    bank_name: string;
    account_name: string;
    sort_code: string;
    account_number: string;
    quote_terms: string;
  };
  preview: boolean;
}

/** /q/:token — what the customer sees. No login; the long random token is the key. */
export function CustomerQuotePage() {
  const { token } = useParams();
  const [data, setData] = useState<PublicQuote | null>(null);
  const [error, setError] = useState('');
  const [optionId, setOptionId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'accept' | 'decline' | 'question' | null>(null);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    api
      .get<PublicQuote>(`/api/public/quotes/${token}`)
      .then((d) => {
        setData(d);
        applyBrand(d.business.brand_colour);
        document.title = `Quote ${d.quote.ref} from ${d.business.name}`;
        const chosen = d.options.find((o) => o.id === d.quote.accepted_option_id) ?? d.options.find((o) => o.recommended) ?? d.options[0];
        setOptionId(chosen?.id ?? null);
      })
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'not-found' : errorMessage(e)));
  }, [token]);

  if (error === 'not-found') {
    return (
      <div className="cq-page">
        <div className="cq-card cq-pad" style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.3rem' }}>We can’t find that quote</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            The link may be incomplete. Try opening it again from your email or text message.
          </p>
        </div>
      </div>
    );
  }
  if (error) return <div className="cq-page"><Banner>{error}</Banner></div>;
  if (!data) return <Spinner label="Loading your quote…" />;

  const { quote, options, customer, business } = data;
  const option = options.find((o) => o.id === optionId) ?? options[0];
  const open = quote.status === 'sent' || quote.status === 'viewed';
  const firstName = customer.name.split(' ')[0];
  const phoneDigits = business.phone.replace(/\s/g, '');

  return (
    <div className="cq-page">
      {data.preview && (
        <div className="cq-preview" role="status">
          <Icon name="eye" size={16} /> Preview: this is what {firstName} sees. You’re logged in, so this visit doesn’t count as them opening it.
        </div>
      )}

      <header className="cq-header">
        <BrandMark name={business.name} logoUrl={business.logo_url} size={48} />
        <div>
          <div className="strong">{business.name}</div>
          {business.phone && <div className="small muted">{business.phone}</div>}
        </div>
      </header>

      <main className="cq-main">
        <section className="cq-card cq-hero">
          <div className="cq-eyebrow">
            Quote {quote.ref} · {formatDate(quote.sent_at ?? quote.created_at)}
          </div>
          <h1>{quote.title || 'Your quote'}</h1>
          <p className="muted">
            For {customer.name}
            {customer.address_line1 ? `, ${customer.address_line1}` : ''}
          </p>
          <div className="cq-total">
            <span className="money">{formatMoney(option.totals.totalPence)}</span>
            <span className="small muted">{quote.vat_registered ? 'including VAT' : 'no VAT to pay'}</span>
          </div>
          {open && quote.valid_until && <p className="small muted">Valid until {formatDateLong(quote.valid_until)}</p>}
        </section>

        {quote.status === 'accepted' && (
          <section className="cq-card cq-pad cq-done">
            <div className="success-tick">
              <Icon name="check" size={30} strokeWidth={3} />
            </div>
            <h2>Thank you{quote.accepted_name ? `, ${quote.accepted_name.split(' ')[0]}` : ''}!</h2>
            <p>
              You accepted this quote on {formatDateLong(quote.accepted_at!)}. {business.name} has been told and will be in touch to book a start date.
            </p>
          </section>
        )}
        {quote.status === 'declined' && <Banner kind="info">You declined this quote. If you change your mind, just get in touch.</Banner>}
        {quote.status === 'expired' && (
          <Banner kind="warn">This quote has expired. Please get in touch with {business.name} for an updated price.</Banner>
        )}
        {quote.status === 'draft' && <Banner kind="info">This quote hasn’t been sent yet. It’s a preview.</Banner>}

        {quote.intro_notes && (
          <section className="cq-card cq-pad">
            <p className="pre-line">{quote.intro_notes}</p>
          </section>
        )}

        {options.length > 1 && (
          <section aria-labelledby="choose-h">
            <h2 id="choose-h" className="cq-section-title">
              {open ? 'Choose an option' : 'Options'}
            </h2>
            <div className="cq-options" role="radiogroup" aria-label="Options">
              {options.map((o) => (
                <button
                  key={o.id}
                  role="radio"
                  aria-checked={o.id === option.id}
                  className={`cq-option${o.id === option.id ? ' selected' : ''}`}
                  onClick={() => setOptionId(o.id)}
                >
                  <span className="cq-radio" aria-hidden="true" />
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <span className="strong" style={{ display: 'block' }}>
                      {o.name || 'Option'}
                    </span>
                    {o.recommended && <span className="pill pill-brand">Recommended</span>}
                  </span>
                  <span className="strong money">{formatMoney(o.totals.totalPence)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="cq-card" aria-labelledby="work-h">
          <h2 id="work-h" className="cq-pad" style={{ paddingBottom: 0 }}>
            {options.length > 1 ? option.name || 'What’s included' : 'What’s included'}
          </h2>
          <ul className="cq-lines">
            {option.lines.map((l) => (
              <li key={l.id}>
                <div className="cq-line-desc">{l.description}</div>
                <div className="cq-line-nums">
                  <span className="muted small">
                    {quantityToInput(l.quantity_x100)}
                    {l.unit === 'item' ? '' : ` ${unitLabel(l.unit)}`} × {formatMoney(l.unit_price_pence)}
                  </span>
                  <span className="strong money">{formatMoney(l.line_total_pence)}</span>
                </div>
              </li>
            ))}
          </ul>
          <dl className="totals cq-pad">
            <dt>Subtotal</dt>
            <dd className="money">{formatMoney(option.totals.subtotalPence)}</dd>
            {quote.vat_registered && (
              <>
                <dt>VAT at {bpToPercent(quote.vat_rate_bp)}%</dt>
                <dd className="money">{formatMoney(option.totals.vatPence)}</dd>
              </>
            )}
            <dt className="grand">Total</dt>
            <dd className="grand money">{formatMoney(option.totals.totalPence)}</dd>
          </dl>
        </section>

        {quote.deposit_bp > 0 && quote.status !== 'declined' && (
          <section className="cq-card cq-pad" aria-labelledby="dep-h">
            <h2 id="dep-h">
              {bpToPercent(quote.deposit_bp)}% deposit: {formatMoney(option.totals.depositPence)}
            </h2>
            <p className="small muted" style={{ margin: '6px 0 12px' }}>
              {quote.status === 'accepted' ? 'Your start date is booked once the deposit arrives.' : 'Due when you accept, to book your start date. It comes off your final invoice.'}
            </p>
            {business.account_number && (
              <dl className="dl small">
                <dt>Account name</dt>
                <dd>{business.account_name}</dd>
                <dt>Sort code</dt>
                <dd className="money">{business.sort_code}</dd>
                <dt>Account number</dt>
                <dd className="money">{business.account_number}</dd>
                <dt>Reference</dt>
                <dd className="strong">{quote.ref}</dd>
              </dl>
            )}
            <div className="cq-card-pay" aria-disabled="true">
              <Icon name="money" size={18} /> Pay by card: coming soon
            </div>
          </section>
        )}

        {quote.exclusions.length > 0 && (
          <section className="cq-card cq-pad" aria-labelledby="exc-h">
            <h2 id="exc-h">Not included</h2>
            <ul className="bullets" style={{ marginTop: 8 }}>
              {quote.exclusions.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        )}

        {business.quote_terms && (
          <details className="cq-card cq-pad cq-terms">
            <summary>Terms and conditions</summary>
            <ul className="bullets small" style={{ marginTop: 10 }}>
              {business.quote_terms
                .split('\n')
                .filter(Boolean)
                .map((t) => (
                  <li key={t}>{t}</li>
                ))}
            </ul>
          </details>
        )}

        <section className="cq-contact">
          <a className="btn btn-secondary" href={`/api/public/quotes/${token}/pdf`} target="_blank" rel="noreferrer">
            <Icon name="download" /> Download PDF
          </a>
          {business.phone && (
            <a className="btn btn-secondary" href={`tel:${phoneDigits}`}>
              <Icon name="phone" /> Call us
            </a>
          )}
        </section>

        <footer className="cq-footer small muted">
          {business.name}
          {business.address.length > 0 && ` · ${business.address.join(', ')}`}
          {business.vat_number && <div>VAT number {business.vat_number}</div>}
        </footer>
      </main>

      {open && (
        <div className="cq-actions">
          <Button variant="primary" size="lg" icon="check" onClick={() => setSheet('accept')}>
            Accept{options.length > 1 ? ` ${formatMoney(option.totals.totalPence)}` : ''}
          </Button>
          <div className="cq-actions-row">
            <Button variant="ghost" icon="help" onClick={() => setSheet('question')}>
              {asked ? 'Ask another' : 'Ask a question'}
            </Button>
            <Button variant="ghost" icon="thumbDown" onClick={() => setSheet('decline')}>
              Decline
            </Button>
          </div>
        </div>
      )}

      <Sheet open={sheet === 'accept'} onClose={() => setSheet(null)} title="Accept this quote">
        {sheet === 'accept' && (
          <AcceptForm
            token={token!}
            data={data}
            optionId={option.id}
            onDone={(d) => {
              setData({ ...d, preview: data.preview });
              setSheet(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
      </Sheet>
      <Sheet open={sheet === 'question'} onClose={() => setSheet(null)} title="Ask a question">
        {sheet === 'question' && (
          <QuestionForm
            token={token!}
            businessName={business.name}
            onDone={() => {
              setAsked(true);
              setSheet(null);
            }}
          />
        )}
      </Sheet>
      <Sheet open={sheet === 'decline'} onClose={() => setSheet(null)} title="Decline this quote">
        {sheet === 'decline' && (
          <DeclineForm
            token={token!}
            onDone={(d) => {
              setData({ ...d, preview: data.preview });
              setSheet(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function AcceptForm({ token, data, optionId, onDone }: { token: string; data: PublicQuote; optionId: number; onDone: (d: PublicQuote) => void }) {
  const option = data.options.find((o) => o.id === optionId)!;
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = 'Please type your name';
    if (!agreed) local.agreed = 'Please tick the box to accept';
    if (Object.keys(local).length) return setErrors(local);
    setBusy(true);
    setErrors({});
    setError('');
    try {
      onDone(await api.post<PublicQuote>(`/api/public/quotes/${token}/accept`, { name: name.trim(), agreed: true, option_id: optionId }));
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
      <div className="cq-accept-summary">
        <div className="small muted">
          {data.quote.ref}
          {option.name ? ` · ${option.name}` : ''}
        </div>
        <div className="strong" style={{ fontSize: '1.4rem' }}>
          {formatMoney(option.totals.totalPence)}
        </div>
        {data.quote.deposit_bp > 0 && <div className="small muted">Deposit due now: {formatMoney(option.totals.depositPence)}</div>}
      </div>
      <TextField
        label="Your full name"
        value={name}
        onChange={(v) => {
          setName(v);
          if (errors.name && v.trim()) setErrors(({ name: _, ...rest }) => rest);
        }}
        error={errors.name}
        autoComplete="name"
        autoFocus
      />
      <div className="field">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              if (e.target.checked) setErrors(({ agreed: _, ...rest }) => rest);
            }}
            aria-invalid={errors.agreed ? true : undefined}
          />
          <span>I accept this quote and the terms</span>
        </label>
        {errors.agreed && <span className="error">{errors.agreed}</span>}
      </div>
      <Button type="submit" variant="primary" size="lg" block loading={busy} icon="check">
        Accept quote
      </Button>
      <p className="tiny muted" style={{ textAlign: 'center' }}>
        We’ll record your name and the time you accepted, so there’s a clear record for you both.
      </p>
    </form>
  );
}

function QuestionForm({ token, businessName, onDone }: { token: string; businessName: string; onDone: () => void }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return setError('Please type your question');
    setBusy(true);
    try {
      await api.post(`/api/public/quotes/${token}/question`, { message: message.trim() });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="form" style={{ textAlign: 'center' }}>
        <div className="success-tick">
          <Icon name="check" size={30} strokeWidth={3} />
        </div>
        <p>Thanks, your question has been sent to {businessName}. They’ll get back to you soon.</p>
        <Button variant="primary" onClick={onDone}>
          Back to the quote
        </Button>
      </div>
    );
  }
  return (
    <form className="form" onSubmit={submit} noValidate>
      <TextArea label="Your question" value={message} onChange={setMessage} error={error} rows={4} placeholder="e.g. Could you start in the first week of March?" autoFocus />
      <Button type="submit" variant="primary" block loading={busy} icon="send">
        Send question
      </Button>
    </form>
  );
}

function DeclineForm({ token, onDone }: { token: string; onDone: (d: PublicQuote) => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      onDone(await api.post<PublicQuote>(`/api/public/quotes/${token}/decline`, { reason: reason.trim() }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form" onSubmit={submit} noValidate>
      {error && <Banner>{error}</Banner>}
      <p className="muted">No problem. It helps to know why, but you don’t have to say.</p>
      <TextArea label="Reason" value={reason} onChange={setReason} optional rows={3} placeholder="e.g. We’ve decided to wait until next year" />
      <Button type="submit" variant="danger" block loading={busy}>
        Decline quote
      </Button>
    </form>
  );
}
