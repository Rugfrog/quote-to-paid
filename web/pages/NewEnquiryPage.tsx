import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../api';
import { CustomerFields, emptyCustomer, type CustomerDraft } from '../components/CustomerForm';
import { Icon } from '../components/Icon';
import { useToast } from '../components/toast';
import { Avatar, Banner, Button, PageHeader, SearchInput, Segmented, TextArea } from '../components/ui';
import { useDebounced } from '../hooks';
import { shrinkImage } from '../images';
import type { Customer, CustomerDetail, Enquiry, EnquirySource } from '../types';

const SOURCES: { value: EnquirySource; label: string }[] = [
  { value: 'phone', label: 'Phone' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Recommended' },
  { value: 'walk-in', label: 'In person' },
  { value: 'other', label: 'Other' },
];

export function NewEnquiryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const presetId = params.get('customer');

  const [mode, setMode] = useState<'new' | 'existing'>(presetId ? 'existing' : 'new');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState<CustomerDraft>(emptyCustomer);
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);
  const [results, setResults] = useState<Customer[]>([]);

  const [description, setDescription] = useState('');
  const [source, setSource] = useState<EnquirySource>('phone');
  const [photos, setPhotos] = useState<File[]>([]);
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!presetId) return;
    api
      .get<CustomerDetail>(`/api/customers/${presetId}`)
      .then((d) => setSelected(d.customer))
      .catch(() => setMode('new'));
  }, [presetId]);

  useEffect(() => {
    if (mode !== 'existing' || selected) return;
    let cancelled = false;
    api
      .get<Customer[]>(`/api/customers?q=${encodeURIComponent(debounced)}`)
      .then((rows) => !cancelled && setResults(rows.slice(0, 8)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [debounced, mode, selected]);

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const shrunk = await Promise.all(Array.from(files).slice(0, 10 - photos.length).map((f) => shrinkImage(f)));
    setPhotos((p) => [...p, ...shrunk].slice(0, 10));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setError('');
    if (mode === 'existing' && !selected) {
      setErrors({ customer_id: 'Choose a customer, or switch to “New customer”' });
      return;
    }
    setBusy(true);
    try {
      const enquiry = await api.post<Enquiry>('/api/enquiries', {
        ...(mode === 'existing' ? { customer_id: selected!.id } : { customer: newCustomer }),
        description,
        source,
      });
      if (photos.length) {
        const form = new FormData();
        photos.forEach((p) => form.append('photos', p));
        try {
          await api.upload(`/api/enquiries/${enquiry.id}/photos`, form);
        } catch (err) {
          toast(`Enquiry saved, but the photos didn’t upload: ${errorMessage(err)}`, 'error');
        }
      }
      toast('Enquiry saved');
      navigate(`/customers/${enquiry.customer_id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        // Customer field errors come back as "customer.name" etc.
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fields)) mapped[k.replace(/^customer\./, 'c.')] = v;
        setErrors(mapped);
      } else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const customerErrors = Object.fromEntries(
    Object.entries(errors)
      .filter(([k]) => k.startsWith('c.'))
      .map(([k, v]) => [k.slice(2), v]),
  );

  return (
    <>
      <PageHeader back={{ to: '/', label: 'Home' }} title="New enquiry" subtitle="Takes about 30 seconds. You can add more detail later." />

      <form className="stack" onSubmit={submit} noValidate>
        {error && <Banner>{error}</Banner>}

        <section className="card card-pad form" aria-labelledby="who-h">
          <h2 id="who-h">Who’s it for?</h2>
          {!presetId && (
            <Segmented
              label="Customer"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setSelected(null);
              }}
              options={[
                { value: 'new', label: 'New customer' },
                { value: 'existing', label: 'Existing customer' },
              ]}
            />
          )}

          {mode === 'new' && <CustomerFields value={newCustomer} onChange={setNewCustomer} errors={customerErrors} showNotes={false} />}

          {mode === 'existing' && selected && (
            <div className="list-row card" style={{ padding: '12px 14px' }}>
              <Avatar name={selected.name} />
              <div className="grow">
                <div className="title">{selected.name}</div>
                <div className="meta">{[selected.address_line1, selected.postcode].filter(Boolean).join(', ') || selected.phone}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Change
              </Button>
            </div>
          )}

          {mode === 'existing' && !selected && (
            <div className="field">
              <SearchInput value={query} onChange={setQuery} label="Find a customer" placeholder="Start typing a name, phone or postcode" />
              {errors.customer_id && <span className="error">{errors.customer_id}</span>}
              {results.length > 0 && (
                <ul className="list card" style={{ marginTop: 6 }}>
                  {results.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="list-row" onClick={() => setSelected(c)}>
                        <Avatar name={c.name} />
                        <div className="grow">
                          <div className="title">{c.name}</div>
                          <div className="meta">{[c.address_line1, c.postcode].filter(Boolean).join(', ')}</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="card card-pad form" aria-labelledby="what-h">
          <h2 id="what-h">What’s the job?</h2>
          <TextArea
            label="Description"
            value={description}
            onChange={setDescription}
            error={errors.description}
            rows={4}
            placeholder="e.g. Re-plaster back bedroom, about 4m x 3m. Skim the ceiling too."
          />
          <Segmented label="How did they get in touch?" value={source} onChange={setSource} options={SOURCES} />

          <div className="field">
            <span className="label">
              Photos <span className="optional">(optional)</span>
            </span>
            <div className="photo-grid" style={{ marginTop: 0 }}>
              {previews.map((url, i) => (
                <div key={url} className="photo">
                  <img src={url} alt={`Photo ${i + 1}`} />
                  <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}>
                    <Icon name="x" size={16} />
                  </button>
                </div>
              ))}
              {photos.length < 10 && (
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
            <span className="hint">Take a photo of the room, or of a note you’ve scribbled. Up to 10.</span>
          </div>
        </section>

        <div className="form-actions">
          <Button onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" variant="primary" size="lg" loading={busy} icon="check">
            Save enquiry
          </Button>
        </div>
      </form>
    </>
  );
}
