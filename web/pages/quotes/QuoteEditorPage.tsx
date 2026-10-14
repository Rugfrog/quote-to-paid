import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { formatAgo, formatDate, formatDateTime, formatMoney, unitLabel } from '../../../shared/format';
import { bpToPercent, lineTotal, penceToInput, percentOf, percentToBp } from '../../../shared/money';
import { api, errorMessage } from '../../api';
import { Icon } from '../../components/Icon';
import { QuoteStatusPill } from '../../components/status';
import { useToast } from '../../components/toast';
import { Banner, Button, EmptyState, PageHeader, Pill, SearchInput, Sheet, Spinner, TextArea, TextField } from '../../components/ui';
import type { PriceItem, QuoteDetail, QuoteEvent, Unit } from '../../types';
import { priceText } from '../PriceListPage';
import { draftFromDetail, draftToBody, lineNumbers, newKey, optionTotals, type EditLine, type QuoteDraft } from './quoteDraft';

const UNITS: { value: Unit; label: string }[] = [
  { value: 'm2', label: 'm²' },
  { value: 'm', label: 'm' },
  { value: 'each', label: 'each' },
  { value: 'day', label: 'day' },
  { value: 'hour', label: 'hour' },
  { value: 'item', label: 'item' },
];

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

interface AiState {
  mode: 'claude' | 'demo';
  notice: string | null;
  assumptions: string[];
  added: number;
  flagged: number;
}

export function QuoteEditorPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const routeState = (location.state ?? {}) as { ai?: AiState; aiError?: string };

  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [activeOption, setActiveOption] = useState(0);
  const [picker, setPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [ai, setAi] = useState<AiState | undefined>(routeState.ai);
  const [aiError, setAiError] = useState(routeState.aiError);
  const [moreAiOpen, setMoreAiOpen] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestDraft = useRef<QuoteDraft | null>(null);
  const savePromise = useRef<Promise<boolean> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<QuoteDetail>(`/api/quotes/${id}`);
      setDetail(d);
      setDraft(draftFromDetail(d));
      latestDraft.current = null;
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------------- Autosave

  const saveNow = useCallback(async (): Promise<boolean> => {
    clearTimeout(saveTimer.current);
    const d = latestDraft.current;
    if (!d) return true;
    const { errors, body } = draftToBody(d);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setSaveState('unsaved');
      return false;
    }
    setSaveState('saving');
    const run = (async () => {
      try {
        const saved = await api.put<QuoteDetail>(`/api/quotes/${id}`, body);
        // Keep what's on screen (it may have changed while saving); refresh everything else.
        setDetail(saved);
        if (latestDraft.current === d) {
          latestDraft.current = null;
          setSaveState('saved');
        }
        return true;
      } catch (e) {
        setSaveState('error');
        toast(errorMessage(e), 'error');
        return false;
      }
    })();
    savePromise.current = run;
    return run;
  }, [id, toast]);

  const update = useCallback(
    (fn: (d: QuoteDraft) => QuoteDraft) => {
      setDraft((d) => {
        if (!d) return d;
        const next = fn(d);
        latestDraft.current = next;
        return next;
      });
      setSaveState('unsaved');
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void saveNow(), 800);
    },
    [saveNow],
  );

  // Save on the way out.
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      const d = latestDraft.current;
      if (d) {
        const { errors, body } = draftToBody(d);
        if (!Object.keys(errors).length) void api.put(`/api/quotes/${id}`, body).catch(() => {});
      }
    },
    [id],
  );

  const q = detail?.quote;
  const depositBp = draft ? (percentToBp(draft.depositText || '0') ?? 0) : 0;
  const totals = useMemo(
    () => (draft && q ? draft.options.map((o) => optionTotals(o, q.vat_registered, q.vat_rate_bp, depositBp)) : []),
    [draft, q, depositBp],
  );

  if (error) return <Banner>{error}</Banner>;
  if (!detail || !draft || !q) return <Spinner />;

  const editable = q.editable;
  const option = draft.options[Math.min(activeOption, draft.options.length - 1)];
  const optIndex = draft.options.indexOf(option);
  const optTotals = totals[optIndex];
  const unpriced = totals.reduce((n, t) => n + t.unpricedLines, 0);
  const lineCount = draft.options.reduce((n, o) => n + o.lines.length, 0);

  // ---------------- Line helpers

  const setOption = (fn: (o: QuoteDraft['options'][number]) => QuoteDraft['options'][number]) =>
    update((d) => ({ ...d, options: d.options.map((o, i) => (i === optIndex ? fn(o) : o)) }));
  const setLine = (key: string, patch: Partial<EditLine>) =>
    setOption((o) => ({ ...o, lines: o.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const removeLine = (key: string) => setOption((o) => ({ ...o, lines: o.lines.filter((l) => l.key !== key) }));
  const moveLine = (key: string, dir: -1 | 1) =>
    setOption((o) => {
      const lines = [...o.lines];
      const i = lines.findIndex((l) => l.key === key);
      const j = i + dir;
      if (j < 0 || j >= lines.length) return o;
      [lines[i], lines[j]] = [lines[j], lines[i]];
      return { ...o, lines };
    });

  function addFromPriceList(item: PriceItem) {
    let line: EditLine;
    if (item.kind === 'markup_percent') {
      const base = optTotals?.subtotalPence ?? 0;
      line = {
        key: newKey(),
        description: `${item.name} (${bpToPercent(item.rate_bp)}%)`,
        qtyText: '1',
        unit: 'item',
        priceText: penceToInput(percentOf(base, item.rate_bp)),
        price_item_id: item.id,
      };
    } else {
      line = {
        key: newKey(),
        description: item.name,
        qtyText: '1',
        unit: item.kind === 'minimum_charge' ? 'item' : item.unit,
        priceText: penceToInput(item.unit_price_pence),
        price_item_id: item.id,
      };
    }
    setOption((o) => ({ ...o, lines: [...o.lines, line] }));
    setPicker(false);
    toast(`Added: ${line.description}. Set the quantity.`);
  }

  function addCustomLine() {
    setOption((o) => ({
      ...o,
      lines: [...o.lines, { key: newKey(), description: '', qtyText: '1', unit: 'item', priceText: '', price_item_id: null }],
    }));
  }

  function addOption() {
    update((d) => {
      const options = d.options.map((o, i) => (i === 0 && !o.name ? { ...o, name: 'Option 1' } : o));
      const copy = { ...option, key: newKey(), name: `Option ${options.length + 1}`, recommended: false, lines: option.lines.map((l) => ({ ...l, key: newKey() })) };
      return { ...d, options: [...options, copy] };
    });
    setActiveOption(draft!.options.length);
    toast('Added an option, copied from this one. Change it to suit.');
  }

  function removeOption() {
    if (!window.confirm(`Delete “${option.name || 'this option'}” and its lines?`)) return;
    update((d) => {
      const options = d.options.filter((_, i) => i !== optIndex);
      if (options.length === 1) options[0] = { ...options[0], name: '', recommended: false };
      return { ...d, options };
    });
    setActiveOption(0);
  }

  async function deleteDraft() {
    if (!window.confirm('Delete this draft quote? This can’t be undone.')) return;
    clearTimeout(saveTimer.current);
    latestDraft.current = null;
    try {
      await api.del(`/api/quotes/${id}`);
      toast('Draft deleted');
      navigate('/quotes', { replace: true });
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  async function openPreview() {
    if (!(await saveNow())) return toast('Fix the highlighted lines first', 'error');
    window.open(`/q/${q!.public_token}`, '_blank', 'noopener');
  }

  async function openPdf() {
    if (!(await saveNow())) return toast('Fix the highlighted lines first', 'error');
    window.open(`/api/quotes/${id}/pdf`, '_blank', 'noopener');
  }

  async function startSend() {
    if (!(await saveNow())) return toast('Fix the highlighted lines first', 'error');
    setSending(true);
  }

  const saveLabel: Record<SaveState, string> = { saved: 'All changes saved', saving: 'Saving…', unsaved: 'Unsaved changes', error: 'Couldn’t save' };

  return (
    <>
      <PageHeader
        back={{ to: '/quotes', label: 'Quotes' }}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {q.ref} <QuoteStatusPill status={q.status} />
          </span>
        }
        subtitle={
          <>
            For <Link to={`/customers/${q.customer_id}`}>{detail.customer.name}</Link>
            {editable && <span className="tiny muted"> · {saveLabel[saveState]}</span>}
          </>
        }
        actions={
          <>
            <Button icon="eye" onClick={openPreview} disabled={lineCount === 0}>
              Preview
            </Button>
            <Button icon="download" onClick={openPdf} disabled={lineCount === 0}>
              PDF
            </Button>
            {editable && (
              <Button variant="primary" icon="send" onClick={startSend} disabled={lineCount === 0}>
                {q.status === 'draft' ? 'Send' : 'Send again'}
              </Button>
            )}
          </>
        }
      />

      <div className="stack">
        {ai && <AiBanner ai={ai} onClose={() => setAi(undefined)} />}
        {aiError && (
          <Banner kind="warn">
            {aiError}{' '}
            <button className="link-button" onClick={() => setAiError(undefined)}>
              Dismiss
            </button>
          </Banner>
        )}
        <StatusBanner detail={detail} />

        {/* ---------------- The job */}
        <section className="card card-pad form" aria-label="Job">
          <TextField label="Job title" value={draft.title} onChange={(v) => update((d) => ({ ...d, title: v }))} disabled={!editable} placeholder="e.g. Re-plaster back bedroom" />
          {q.brief && (
            <details className="brief">
              <summary>What you told us ({q.source === 'voice' ? 'voice note' : q.source === 'photo' ? 'photos' : 'typed'})</summary>
              <p className="pre-line small">{q.brief}</p>
            </details>
          )}
          {detail.photos.length > 0 && (
            <div className="photo-grid" style={{ marginTop: 0 }}>
              {detail.photos.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="photo">
                  <img src={p.url} alt="Job photo" loading="lazy" />
                </a>
              ))}
            </div>
          )}
          {editable && (
            <div>
              <Button size="sm" icon="sparkle" onClick={() => setMoreAiOpen(true)}>
                {lineCount === 0 ? 'Build lines from a description' : 'Add more with AI'}
              </Button>
            </div>
          )}
        </section>

        {/* ---------------- Options and lines */}
        <section aria-label="Prices">
          {draft.options.length > 1 && (
            <div className="option-tabs" role="tablist" aria-label="Options">
              {draft.options.map((o, i) => (
                <button key={o.key} role="tab" aria-selected={i === optIndex} className="option-tab" onClick={() => setActiveOption(i)}>
                  <span>{o.name || `Option ${i + 1}`}</span>
                  <span className="money small">{formatMoney(totals[i]?.totalPence ?? 0)}</span>
                  {o.recommended && <Icon name="star" size={14} />}
                </button>
              ))}
            </div>
          )}

          <div className="card">
            {draft.options.length > 1 && (
              <div className="card-pad option-head">
                <TextField label="Option name" value={option.name} onChange={(v) => setOption((o) => ({ ...o, name: v }))} disabled={!editable} placeholder="e.g. Full re-plaster" />
                {editable && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button
                      size="sm"
                      icon="star"
                      variant={option.recommended ? 'primary' : 'secondary'}
                      onClick={() => update((d) => ({ ...d, options: d.options.map((o, i) => ({ ...o, recommended: i === optIndex ? !o.recommended : false })) }))}
                      aria-pressed={option.recommended}
                    >
                      {option.recommended ? 'Recommended' : 'Mark as recommended'}
                    </Button>
                    <Button size="sm" variant="danger" icon="trash" onClick={removeOption}>
                      Delete option
                    </Button>
                  </div>
                )}
              </div>
            )}

            {option.lines.length === 0 ? (
              <EmptyState icon="list" title="No lines yet">
                Add items from your price list, or a custom line.
              </EmptyState>
            ) : (
              <ul className="list quote-lines">
                {option.lines.map((l, i) => (
                  <LineRow
                    key={l.key}
                    line={l}
                    index={i}
                    count={option.lines.length}
                    editable={editable}
                    errors={fieldErrors}
                    onChange={(patch) => setLine(l.key, patch)}
                    onRemove={() => removeLine(l.key)}
                    onMove={(dir) => moveLine(l.key, dir)}
                  />
                ))}
              </ul>
            )}

            {editable && (
              <div className="card-pad add-line-row">
                <Button variant="primary" icon="list" onClick={() => setPicker(true)}>
                  Add from price list
                </Button>
                <Button icon="plus" onClick={addCustomLine}>
                  Custom line
                </Button>
                {draft.options.length < 3 && (
                  <Button variant="ghost" icon="copy" onClick={addOption}>
                    {draft.options.length === 1 ? 'Add another option' : 'Add option'}
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ---------------- Totals */}
        {optTotals && (
          <section className="card card-pad totals-card" aria-label="Totals">
            {optTotals.unpricedLines > 0 && (
              <Banner kind="warn">
                {optTotals.unpricedLines} line{optTotals.unpricedLines === 1 ? ' needs a price' : 's need prices'}. They aren’t in the total yet.
              </Banner>
            )}
            <dl className="totals">
              <dt>Subtotal</dt>
              <dd className="money">{formatMoney(optTotals.subtotalPence)}</dd>
              {q.vat_registered && (
                <>
                  <dt>VAT at {bpToPercent(q.vat_rate_bp)}%</dt>
                  <dd className="money">{formatMoney(optTotals.vatPence)}</dd>
                </>
              )}
              <dt className="grand">{q.vat_registered ? 'Total including VAT' : 'Total'}</dt>
              <dd className="grand money">{formatMoney(optTotals.totalPence)}</dd>
              {depositBp > 0 && (
                <>
                  <dt>Deposit ({bpToPercent(depositBp)}%)</dt>
                  <dd className="money">{formatMoney(optTotals.depositPence)}</dd>
                </>
              )}
            </dl>
            {!q.vat_registered && <p className="tiny muted">No VAT: the business isn’t VAT registered.</p>}
          </section>
        )}

        {/* ---------------- What the customer reads */}
        <section className="card card-pad form" aria-labelledby="extras-h">
          <h2 id="extras-h">Notes for the customer</h2>
          <TextArea
            label="Message at the top"
            value={draft.intro_notes}
            onChange={(v) => update((d) => ({ ...d, intro_notes: v }))}
            optional
            rows={2}
            disabled={!editable}
            placeholder="e.g. Thanks for having us round. Here’s the price we talked about."
          />
          <TextArea
            label="Not included"
            value={draft.exclusionsText}
            onChange={(v) => update((d) => ({ ...d, exclusionsText: v }))}
            optional
            rows={3}
            disabled={!editable}
            hint="One per line, e.g. Decorating"
          />
          <div className="form-row cols-2">
            <TextField
              label="Valid for"
              value={draft.validityText}
              onChange={(v) => update((d) => ({ ...d, validityText: v }))}
              suffix="days"
              inputMode="numeric"
              error={fieldErrors.validity}
              disabled={!editable}
            />
            <TextField
              label="Deposit"
              value={draft.depositText}
              onChange={(v) => update((d) => ({ ...d, depositText: v }))}
              suffix="%"
              inputMode="decimal"
              error={fieldErrors.deposit}
              hint="0 for no deposit"
              disabled={!editable}
            />
          </div>
        </section>

        {q.customer_questions.length > 0 && (
          <section className="card card-pad" aria-labelledby="ask-h">
            <h2 id="ask-h" style={{ marginBottom: 8 }}>
              Worth asking {detail.customer.name.split(' ')[0]}
            </h2>
            <p className="small muted" style={{ marginBottom: 8 }}>
              Suggested questions. Only you see these.
            </p>
            <ul className="bullets">
              {q.customer_questions.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        )}

        <Conversation detail={detail} onChange={setDetail} />
        <Timeline events={detail.events} />

        {q.status === 'draft' && (
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            <Button variant="ghost" icon="trash" onClick={deleteDraft}>
              Delete draft
            </Button>
          </div>
        )}
      </div>

      {unpriced === 0 && editable && lineCount > 0 && optTotals && (
        <div className="sticky-send">
          <div>
            <div className="tiny muted">{draft.options.length > 1 ? `${option.name || 'This option'}` : 'Total'}</div>
            <div className="strong money">{formatMoney(optTotals.totalPence)}</div>
          </div>
          <Button variant="primary" icon="send" onClick={startSend}>
            {q.status === 'draft' ? 'Send quote' : 'Send again'}
          </Button>
        </div>
      )}

      <Sheet open={picker} onClose={() => setPicker(false)} title="Add from your price list">
        {picker && <PricePicker onPick={addFromPriceList} />}
      </Sheet>

      <Sheet open={sending} onClose={() => setSending(false)} title={`Send ${q.ref} to ${detail.customer.name}`}>
        {sending && (
          <SendPanel
            detail={detail}
            unpriced={unpriced}
            onSent={(d) => {
              setDetail(d);
              setSending(false);
            }}
          />
        )}
      </Sheet>

      <Sheet open={moreAiOpen} onClose={() => setMoreAiOpen(false)} title="Add lines with AI">
        {moreAiOpen && (
          <MoreAi
            quoteId={q.id}
            initial={lineCount === 0 ? q.brief : ''}
            beforeRun={saveNow}
            onDone={(d) => {
              setDetail(d);
              setDraft(draftFromDetail(d));
              latestDraft.current = null;
              setSaveState('saved');
              setAi(d.ai);
              setMoreAiOpen(false);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- Pieces

function AiBanner({ ai, onClose }: { ai: AiState; onClose: () => void }) {
  return (
    <div className="ai-banner" role="status">
      <div className="ai-banner-head">
        <span className="ai-orb small">
          <Icon name="sparkle" size={18} />
        </span>
        <div style={{ flex: 1 }}>
          <div className="strong">
            {ai.added} line{ai.added === 1 ? '' : 's'} added from your price list
            {ai.flagged > 0 && `, ${ai.flagged} to check`}
          </div>
          <div className="small muted">
            {ai.mode === 'demo' ? 'Demo mode (built-in estimator, no AI key)' : 'Worked out by AI'} · Check quantities before sending
          </div>
        </div>
        <Button variant="ghost" size="sm" icon="x" aria-label="Dismiss" onClick={onClose} />
      </div>
      {ai.notice && <p className="small" style={{ marginTop: 8 }}>{ai.notice}</p>}
      {ai.assumptions.length > 0 && (
        <ul className="bullets small" style={{ marginTop: 8 }}>
          {ai.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBanner({ detail }: { detail: QuoteDetail }) {
  const q = detail.quote;
  if (q.status === 'accepted') {
    const option = detail.options.find((o) => o.id === q.accepted_option_id);
    return (
      <Banner kind="ok">
        <strong>Accepted by {q.accepted_name}</strong> on {formatDateTime(q.accepted_at!)}
        {option?.name ? ` (${option.name})` : ''}. It can’t be changed now.
      </Banner>
    );
  }
  if (q.status === 'declined') {
    return (
      <Banner kind="error">
        Declined {formatAgo(q.declined_at!)}
        {q.decline_reason ? `: “${q.decline_reason}”` : '.'}
      </Banner>
    );
  }
  if (q.status === 'expired') return <Banner kind="warn">This quote expired on {formatDate(q.valid_until!)}. Make a new one if they still want the work.</Banner>;
  if (q.status === 'viewed') return <Banner kind="info">{detail.customer.name.split(' ')[0]} opened it {formatAgo(q.first_viewed_at!)}. Valid until {formatDate(q.valid_until!)}.</Banner>;
  if (q.status === 'sent') return <Banner kind="info">Sent {formatAgo(q.sent_at!)}. Not opened yet. Valid until {formatDate(q.valid_until!)}.</Banner>;
  return null;
}

function LineRow({
  line,
  index,
  count,
  editable,
  errors,
  onChange,
  onRemove,
  onMove,
}: {
  line: EditLine;
  index: number;
  count: number;
  editable: boolean;
  errors: Record<string, string>;
  onChange: (patch: Partial<EditLine>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { qty, price } = lineNumbers(line);
  const total = price === null ? null : lineTotal(qty, price);
  const needsPrice = line.priceText.trim() === '';
  const n = index + 1;
  return (
    <li className={`quote-line${needsPrice ? ' needs-price' : ''}`}>
      <div className="ql-top">
        <textarea
          className="input ql-desc"
          value={line.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={1}
          aria-label={`Line ${n} description`}
          placeholder="What’s the work?"
          disabled={!editable}
          aria-invalid={errors[`${line.key}.description`] ? true : undefined}
        />
        {editable && (
          <div className="ql-tools">
            <Button size="sm" variant="ghost" icon="chevronUp" aria-label={`Move line ${n} up`} disabled={index === 0} onClick={() => onMove(-1)} />
            <Button size="sm" variant="ghost" icon="chevronDown" aria-label={`Move line ${n} down`} disabled={index === count - 1} onClick={() => onMove(1)} />
            <Button size="sm" variant="ghost" icon="trash" aria-label={`Remove line ${n}`} onClick={onRemove} />
          </div>
        )}
      </div>
      <div className="ql-nums">
        <input
          className="input"
          value={line.qtyText}
          onChange={(e) => onChange({ qtyText: e.target.value })}
          inputMode="decimal"
          aria-label={`Line ${n} quantity`}
          disabled={!editable}
          aria-invalid={errors[`${line.key}.qty`] ? true : undefined}
        />
        <select className="select" value={line.unit} onChange={(e) => onChange({ unit: e.target.value as Unit })} aria-label={`Line ${n} unit`} disabled={!editable}>
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
        <span className="ql-times" aria-hidden="true">
          ×
        </span>
        <div className="input-group">
          <span className="prefix">£</span>
          <input
            className="input"
            value={line.priceText}
            onChange={(e) => onChange({ priceText: e.target.value })}
            inputMode="decimal"
            placeholder="Price"
            aria-label={`Line ${n} price per ${unitLabel(line.unit)}`}
            disabled={!editable}
            aria-invalid={errors[`${line.key}.price`] ? true : undefined}
          />
        </div>
        <span className="ql-total money">{total === null ? '—' : formatMoney(total)}</span>
      </div>
      {(needsPrice || errors[`${line.key}.qty`] || errors[`${line.key}.price`] || errors[`${line.key}.description`]) && (
        <div className="ql-flags">
          {needsPrice && <Pill kind="warn">Check price: not on your price list</Pill>}
          {[errors[`${line.key}.description`], errors[`${line.key}.qty`], errors[`${line.key}.price`]].filter(Boolean).map((e) => (
            <span key={e} className="error small">
              {e}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function PricePicker({ onPick }: { onPick: (item: PriceItem) => void }) {
  const [items, setItems] = useState<PriceItem[] | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    api.get<PriceItem[]>('/api/price-items').then((all) => setItems(all.filter((i) => i.active)));
  }, []);
  if (!items) return <Spinner />;
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
  const groups = [...new Set(shown.map((i) => i.category))];
  return (
    <div className="form">
      <SearchInput value={query} onChange={setQuery} label="Search price list" placeholder="Search, e.g. skim" />
      {groups.length === 0 && <p className="muted small">Nothing matches. Add a custom line instead.</p>}
      {groups.map((g) => (
        <div key={g}>
          <h3 className="section-title" style={{ marginTop: 6 }}>
            {g}
          </h3>
          <ul className="list card">
            {shown
              .filter((i) => i.category === g)
              .map((i) => {
                const { price, per } = priceText(i);
                return (
                  <li key={i.id}>
                    <button className="list-row price-row" onClick={() => onPick(i)}>
                      <div className="grow">
                        <div className="title">{i.name}</div>
                      </div>
                      <div className="end">
                        <span className="price">{price}</span> <span className="per">{per}</span>
                      </div>
                      <Icon name="plus" size={18} />
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SendPanel({ detail, unpriced, onSent }: { detail: QuoteDetail; unpriced: number; onSent: (d: QuoteDetail) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<QuoteDetail | null>(null);
  const c = detail.customer;
  const how = c.email ? `By email to ${c.email}` : c.phone ? `By text to ${c.phone}` : null;

  async function send() {
    setBusy(true);
    setError('');
    try {
      const d = await api.post<QuoteDetail>(`/api/quotes/${detail.quote.id}/send`);
      setSent(d);
      toast(`Sent to ${c.name.split(' ')[0]}`);
    } catch (e) {
      setError(errorMessage(e));
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
        <h3>Quote sent</h3>
        <p className="muted">
          {sent.sent?.channel === 'sms' ? 'Texted' : 'Emailed'} to {sent.sent?.address}. You’ll get a notification when {c.name.split(' ')[0]} opens it.
        </p>
        <p className="small muted">Demo: nothing really leaves the app. See exactly what they’d get in the Outbox.</p>
        <div className="form-actions" style={{ justifyContent: 'center' }}>
          <Link to="/outbox" className="btn btn-secondary">
            <Icon name="inbox" /> Open outbox
          </Link>
          <a href={`/q/${detail.quote.public_token}`} target="_blank" rel="noreferrer" className="btn btn-secondary">
            <Icon name="eye" /> Customer view
          </a>
          <Button variant="primary" onClick={() => onSent(sent)}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="form">
      {error && <Banner>{error}</Banner>}
      {unpriced > 0 ? (
        <Banner kind="warn">
          {unpriced} line{unpriced === 1 ? ' needs a price' : 's need prices'} first. Look for “Check price”.
        </Banner>
      ) : !how ? (
        <Banner kind="warn">
          {c.name} has no email or mobile number. <Link to={`/customers/${c.id}`}>Add one</Link>, then send.
        </Banner>
      ) : (
        <>
          <p>
            {how}, with a link to view and accept the quote on their phone.
          </p>
          <ul className="bullets small muted">
            <li>Valid for {detail.quote.validity_days} days from today</li>
            {detail.quote.deposit_bp > 0 && <li>Asks for a {bpToPercent(detail.quote.deposit_bp)}% deposit when they accept</li>}
            {detail.options.length > 1 && <li>{detail.options.length} options for them to choose from</li>}
          </ul>
        </>
      )}
      <div className="form-actions">
        <Button variant="primary" size="lg" icon="send" onClick={send} loading={busy} disabled={unpriced > 0 || !how}>
          Send quote
        </Button>
      </div>
    </div>
  );
}

function MoreAi({ quoteId, initial, beforeRun, onDone }: { quoteId: number; initial: string; beforeRun: () => Promise<boolean>; onDone: (d: QuoteDetail) => void }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    if (!text.trim()) return setError('Describe the extra work first');
    setBusy(true);
    setError('');
    try {
      await beforeRun();
      onDone(await api.post<QuoteDetail>(`/api/quotes/${quoteId}/ai-fill`, { brief: text.trim() }));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <div className="form">
      <TextArea
        label="Describe the work to add"
        value={text}
        onChange={setText}
        rows={4}
        error={error}
        placeholder="e.g. Also coving in the lounge, about 14 metres"
        hint="New lines are added to the first option. Existing lines aren’t changed."
      />
      <div className="form-actions">
        <Button variant="primary" icon="sparkle" onClick={run} loading={busy}>
          {busy ? 'Working it out…' : 'Add lines'}
        </Button>
      </div>
    </div>
  );
}

function Conversation({ detail, onChange }: { detail: QuoteDetail; onChange: (d: QuoteDetail) => void }) {
  const toast = useToast();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  if (detail.messages.length === 0) return null;
  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      onChange(await api.post<QuoteDetail>(`/api/quotes/${detail.quote.id}/reply`, { body: reply.trim() }));
      setReply('');
      toast('Reply sent');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card card-pad" aria-labelledby="conv-h">
      <h2 id="conv-h" style={{ marginBottom: 12 }}>
        Questions
      </h2>
      <div className="conversation">
        {detail.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.sender}`}>
            <p className="pre-line">{m.body}</p>
            <span className="tiny muted">
              {m.sender === 'customer' ? detail.customer.name : 'You'} · {formatDateTime(m.created_at)}
            </span>
          </div>
        ))}
      </div>
      <div className="form" style={{ marginTop: 12 }}>
        <TextArea label="Reply" value={reply} onChange={setReply} rows={2} placeholder="Type your answer…" />
        <div className="form-actions">
          <Button variant="primary" icon="send" onClick={send} loading={busy} disabled={!reply.trim()}>
            Send reply
          </Button>
        </div>
      </div>
    </section>
  );
}

function eventText(e: QuoteEvent): string {
  const d = e.detail as Record<string, string | boolean | number | null>;
  switch (e.type) {
    case 'created':
      return `Created${d.source && d.source !== 'blank' ? ` from ${d.source === 'voice' ? 'a voice note' : d.source === 'photo' ? 'photos' : 'a description'}` : ''}`;
    case 'sent':
      return `${d.resend ? 'Sent again' : 'Sent'} by ${d.channel === 'sms' ? 'text' : 'email'} to ${d.to}`;
    case 'viewed':
      return 'Customer opened the quote';
    case 'accepted':
      return d.on_behalf_of_customer
        ? `Accepted for the customer by ${d.recorded_by} (name given: ${d.name})`
        : `Accepted by ${d.name}, who ticked “I accept this quote and the terms”`;
    case 'declined':
      return `Declined${d.on_behalf_of_customer ? ` (recorded by ${d.recorded_by})` : ''}${d.reason ? `: “${d.reason}”` : ''}`;
    case 'question':
      return 'Customer asked a question';
    case 'nudged':
      return `Reminder sent to ${d.to}`;
    default:
      return e.type;
  }
}

function Timeline({ events }: { events: QuoteEvent[] }) {
  return (
    <section className="card card-pad" aria-labelledby="hist-h">
      <h2 id="hist-h" style={{ marginBottom: 12 }}>
        History
      </h2>
      <ol className="timeline">
        {[...events].reverse().map((e) => (
          <li key={e.id}>
            <span className={`tl-dot ${e.type}`} aria-hidden="true" />
            <div>
              <div className="small">{eventText(e)}</div>
              <div className="tiny muted">{formatDateTime(e.created_at)}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
