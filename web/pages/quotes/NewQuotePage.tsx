import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../../api';
import { CustomerPicker, type CustomerChoice } from '../../components/CustomerPicker';
import { Icon } from '../../components/Icon';
import { VoiceButton } from '../../components/VoiceButton';
import { Banner, Button, PageHeader, TextArea } from '../../components/ui';
import { shrinkImage } from '../../images';
import type { Customer, CustomerDetail, Enquiry, QuoteDetail, QuoteSource } from '../../types';

const DRAFT_KEY = 'qtp:new-quote-brief';
const STEPS = ['Reading your notes…', 'Matching your price list…', 'Measuring up…', 'Adding it up…'];

function loadDraft(): string {
  try {
    return sessionStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}
function saveDraft(text: string) {
  try {
    if (text) sessionStorage.setItem(DRAFT_KEY, text);
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* private mode: fine */
  }
}

export function NewQuotePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const enquiryId = Number(params.get('enquiry')) || null;
  const customerId = Number(params.get('customer')) || null;

  const [choice, setChoice] = useState<CustomerChoice>({ kind: 'existing', customer: null });
  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [brief, setBrief] = useState(loadDraft);
  const [usedVoice, setUsedVoice] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  const [busy, setBusy] = useState<'ai' | 'blank' | null>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => saveDraft(brief), [brief]);

  // Starting from an enquiry or a customer page: fill in what we know.
  useEffect(() => {
    if (enquiryId) {
      api
        .get<Enquiry>(`/api/enquiries/${enquiryId}`)
        .then(async (e) => {
          setEnquiry(e);
          if (!loadDraft()) setBrief(e.description);
          const d = await api.get<CustomerDetail>(`/api/customers/${e.customer_id}`);
          setChoice({ kind: 'existing', customer: d.customer });
        })
        .catch(() => {});
    } else if (customerId) {
      api
        .get<CustomerDetail>(`/api/customers/${customerId}`)
        .then((d) => setChoice({ kind: 'existing', customer: d.customer }))
        .catch(() => {});
    }
  }, [enquiryId, customerId]);

  useEffect(() => {
    if (busy !== 'ai') return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 1400);
    return () => clearInterval(t);
  }, [busy]);

  const addVoiceText = useCallback((text: string) => {
    setUsedVoice(true);
    setBrief((b) => (b.trim() ? `${b.trim()} ${text}` : text));
  }, []);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const shrunk = await Promise.all(Array.from(files).slice(0, 4 - photos.length).map((f) => shrinkImage(f)));
    setPhotos((p) => [...p, ...shrunk].slice(0, 4));
  }

  async function resolveCustomer(): Promise<Customer | null> {
    if (choice.kind === 'existing') {
      if (!choice.customer) {
        setErrors({ customer_id: 'Choose a customer, or switch to “New customer”' });
        return null;
      }
      return choice.customer;
    }
    try {
      return await api.post<Customer>('/api/customers', choice.draft);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setError(errorMessage(err));
      return null;
    }
  }

  async function start(withAi: boolean) {
    setErrors({});
    setError('');
    if (withAi && !brief.trim() && photos.length === 0 && !enquiry?.photos?.length) {
      setErrors({ brief: 'Describe the job, record a voice note or add a photo' });
      return;
    }
    setBusy(withAi ? 'ai' : 'blank');
    setStep(0);
    const customer = await resolveCustomer();
    if (!customer) return setBusy(null);

    const source: QuoteSource = !withAi ? 'blank' : usedVoice ? 'voice' : photos.length && !brief.trim() ? 'photo' : 'text';
    let quoteId: number | null = null;
    try {
      const created = await api.post<QuoteDetail>('/api/quotes', {
        customer_id: customer.id,
        enquiry_id: enquiry && enquiry.customer_id === customer.id ? enquiry.id : null,
        source,
        brief: brief.trim(),
      });
      quoteId = created.quote.id;
      if (photos.length) {
        const form = new FormData();
        photos.forEach((p) => form.append('photos', p));
        await api.upload(`/api/quotes/${quoteId}/photos`, form);
      }
      if (!withAi) {
        saveDraft('');
        navigate(`/quotes/${quoteId}`, { replace: true });
        return;
      }
      const filled = await api.post<QuoteDetail>(`/api/quotes/${quoteId}/ai-fill`, {});
      saveDraft('');
      navigate(`/quotes/${quoteId}`, { replace: true, state: { ai: filled.ai } });
    } catch (err) {
      if (quoteId) {
        // The quote (with your notes) exists: carry on there and add lines by hand.
        saveDraft('');
        navigate(`/quotes/${quoteId}`, {
          replace: true,
          state: { aiError: `We couldn’t build the quote automatically (${errorMessage(err)}). Your notes are saved: add the lines below.` },
        });
      } else {
        setError(errorMessage(err));
        setBusy(null);
      }
    }
  }

  const enquiryPhotos = enquiry?.photos ?? [];

  if (busy === 'ai') {
    return (
      <div className="ai-working" role="status" aria-live="polite">
        <div className="ai-orb">
          <Icon name="sparkle" size={34} />
        </div>
        <h1>Working out your quote…</h1>
        <p className="muted">{STEPS[step]}</p>
        <p className="small muted" style={{ maxWidth: 320 }}>
          Priced from your own price list. Anything that isn’t on it will be marked “check price”.
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader back={{ to: '/quotes', label: 'Quotes' }} title="New quote" subtitle="Say it, type it or snap it. We’ll price it from your price list." />

      <div className="stack">
        {error && <Banner>{error}</Banner>}

        <section className="card card-pad form" aria-labelledby="for-h">
          <h2 id="for-h">Who’s it for?</h2>
          <CustomerPicker value={choice} onChange={setChoice} errors={errors} locked={Boolean(enquiry)} />
        </section>

        <section className="card card-pad form" aria-labelledby="job-h">
          <h2 id="job-h">What’s the job?</h2>
          <VoiceButton onText={addVoiceText} />
          <TextArea
            label="Description"
            value={brief}
            onChange={setBrief}
            error={errors.brief}
            rows={4}
            placeholder="e.g. Re-plaster the back bedroom, about 4 by 3 metres, skim the ceiling too"
            hint="Include rooms, rough sizes and anything special. Your voice note appears here, and you can edit it."
          />

          <div className="field">
            <span className="label">
              Photos <span className="optional">(optional)</span>
            </span>
            <div className="photo-grid" style={{ marginTop: 0 }}>
              {enquiryPhotos.map((p) => (
                <div key={`e${p.id}`} className="photo">
                  <img src={p.url} alt="Photo from the enquiry" />
                </div>
              ))}
              {previews.map((url, i) => (
                <div key={url} className="photo">
                  <img src={url} alt={`Photo ${i + 1}`} />
                  <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}>
                    <Icon name="x" size={16} />
                  </button>
                </div>
              ))}
              {photos.length < 4 && (
                <label className="photo-add">
                  <Icon name="camera" size={24} />
                  Add photo
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      addPhotos(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
            <span className="hint">A photo of the room, or of a note you’ve scribbled. Up to 4.</span>
          </div>
        </section>

        <div className="form-actions">
          <Button onClick={() => start(false)} loading={busy === 'blank'} disabled={busy !== null}>
            Start blank instead
          </Button>
          <Button variant="primary" size="lg" icon="sparkle" onClick={() => start(true)} disabled={busy !== null}>
            Build my quote
          </Button>
        </div>
      </div>
    </>
  );
}
