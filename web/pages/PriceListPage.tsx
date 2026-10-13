import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatMoney, unitLabel } from '../../shared/format';
import { bpToPercent, parsePoundsToPence, penceToInput, percentToBp } from '../../shared/money';
import { api, ApiError, errorMessage } from '../api';
import { Icon } from '../components/Icon';
import { useToast } from '../components/toast';
import {
  Banner,
  Button,
  EmptyState,
  PageHeader,
  Pill,
  SearchInput,
  SelectField,
  Sheet,
  Spinner,
  TextArea,
  TextField,
  Toggle,
} from '../components/ui';
import type { PriceItem, PriceKind, Unit } from '../types';

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'm2', label: 'per m² (square metre)' },
  { value: 'm', label: 'per metre' },
  { value: 'each', label: 'each' },
  { value: 'day', label: 'per day' },
  { value: 'hour', label: 'per hour' },
  { value: 'item', label: 'per job / lump sum' },
];

const KIND_OPTIONS: { value: PriceKind; label: string }[] = [
  { value: 'standard', label: 'Normal price' },
  { value: 'markup_percent', label: 'Percentage markup (e.g. on materials)' },
  { value: 'minimum_charge', label: 'Minimum charge' },
];

export function priceText(item: PriceItem): { price: string; per: string } {
  if (item.kind === 'markup_percent') return { price: `${bpToPercent(item.rate_bp)}%`, per: 'markup' };
  if (item.kind === 'minimum_charge') return { price: formatMoney(item.unit_price_pence), per: 'minimum' };
  return { price: formatMoney(item.unit_price_pence), per: item.unit === 'item' ? '' : `/ ${unitLabel(item.unit)}` };
}

export function PriceListPage() {
  const toast = useToast();
  const [items, setItems] = useState<PriceItem[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [editing, setEditing] = useState<PriceItem | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    api
      .get<PriceItem[]>('/api/price-items')
      .then(setItems)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const visible = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (showHidden || i.active) &&
        (!q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)),
    );
  }, [items, query, showHidden]);

  const groups = useMemo(() => {
    const map = new Map<string, PriceItem[]>();
    for (const item of visible) map.set(item.category, [...(map.get(item.category) ?? []), item]);
    return [...map.entries()];
  }, [visible]);

  const categories = useMemo(() => [...new Set((items ?? []).map((i) => i.category))], [items]);
  const hiddenCount = items?.filter((i) => !i.active).length ?? 0;

  async function move(item: PriceItem, direction: -1 | 1) {
    if (!items) return;
    // Move within its category, then save the whole order.
    const group = items.filter((i) => i.category === item.category);
    const idx = group.findIndex((i) => i.id === item.id);
    const swap = group[idx + direction];
    if (!swap) return;
    const order = items.map((i) => i.id);
    const a = order.indexOf(item.id);
    const b = order.indexOf(swap.id);
    [order[a], order[b]] = [order[b], order[a]];
    const byId = new Map(items.map((i) => [i.id, i]));
    setItems(order.map((id) => byId.get(id)!));
    try {
      setItems(await api.post<PriceItem[]>('/api/price-items/reorder', { ids: order }));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  function saved(item: PriceItem, isNew: boolean) {
    setItems((list) => (isNew ? [...(list ?? []), item] : (list ?? []).map((i) => (i.id === item.id ? item : i))));
    setEditing(null);
  }

  return (
    <>
      <PageHeader
        title="Price list"
        subtitle="Quotes are priced from these. Prices are before VAT."
        actions={
          <>
            <Button icon="upload" onClick={() => setImporting(true)}>
              Import
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
              Add item
            </Button>
          </>
        }
      />

      {error && <Banner>{error}</Banner>}
      {!items && !error && <Spinner />}

      {items && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ flex: '1 1 240px' }}>
              <SearchInput value={query} onChange={setQuery} label="Search price list" placeholder="Search items…" />
            </div>
            <Button size="sm" variant={reordering ? 'primary' : 'ghost'} onClick={() => setReordering((r) => !r)} aria-pressed={reordering}>
              {reordering ? 'Done' : 'Reorder'}
            </Button>
            {hiddenCount > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setShowHidden((s) => !s)} aria-pressed={showHidden}>
                {showHidden ? 'Hide hidden items' : `Show ${hiddenCount} hidden`}
              </Button>
            )}
          </div>

          {items.length === 0 && (
            <div className="card">
              <EmptyState
                icon="list"
                title="Your price list is empty"
                action={
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
                      Add an item
                    </Button>
                    <Button icon="upload" onClick={() => setImporting(true)}>
                      Import a spreadsheet
                    </Button>
                  </div>
                }
              >
                Add the things you charge for (per m², per metre, day rates) so quotes price themselves.
              </EmptyState>
            </div>
          )}

          {items.length > 0 && groups.length === 0 && (
            <div className="card">
              <EmptyState icon="search" title="Nothing matches">
                Try a different word.
              </EmptyState>
            </div>
          )}

          {groups.map(([category, rows]) => (
            <section key={category} aria-label={category}>
              <h2 className="section-title">{category}</h2>
              <ul className="list card">
                {rows.map((item, i) => {
                  const { price, per } = priceText(item);
                  return (
                    <li key={item.id} style={{ display: 'flex', alignItems: 'center' }}>
                      {reordering && (
                        <div className="reorder-buttons" style={{ paddingLeft: 10 }}>
                          <Button size="sm" variant="ghost" icon="chevronUp" aria-label={`Move ${item.name} up`} disabled={i === 0} onClick={() => move(item, -1)} />
                          <Button size="sm" variant="ghost" icon="chevronDown" aria-label={`Move ${item.name} down`} disabled={i === rows.length - 1} onClick={() => move(item, 1)} />
                        </div>
                      )}
                      <button className={`list-row price-row${item.active ? '' : ' hidden-item'}`} onClick={() => setEditing(item)}>
                        <div className="grow">
                          <div className="title">
                            {item.name} {!item.active && <Pill>Hidden</Pill>}
                          </div>
                          {item.description && <div className="meta">{item.description}</div>}
                        </div>
                        <div className="end">
                          <span className="price">{price}</span> <span className="per">{per}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add price list item' : 'Edit item'}>
        {editing !== null && (
          <PriceItemForm
            item={editing === 'new' ? undefined : editing}
            categories={categories}
            onCancel={() => setEditing(null)}
            onSaved={saved}
          />
        )}
      </Sheet>

      <Sheet open={importing} onClose={() => setImporting(false)} title="Import price list">
        <ImportForm
          onCancel={() => setImporting(false)}
          onDone={(list) => {
            setItems(list);
            setImporting(false);
          }}
        />
      </Sheet>
    </>
  );
}

function PriceItemForm({
  item,
  categories,
  onSaved,
  onCancel,
}: {
  item?: PriceItem;
  categories: string[];
  onSaved: (item: PriceItem, isNew: boolean) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [category, setCategory] = useState(item?.category ?? categories[0] ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [unit, setUnit] = useState<Unit>(item?.unit ?? 'm2');
  const [kind, setKind] = useState<PriceKind>(item?.kind ?? 'standard');
  const [price, setPrice] = useState(item ? penceToInput(item.unit_price_pence) : '');
  const [rate, setRate] = useState(item ? bpToPercent(item.rate_bp) : '');
  const [active, setActive] = useState(item?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    const pence = kind === 'markup_percent' ? 0 : parsePoundsToPence(price || '');
    const bp = kind === 'markup_percent' ? percentToBp(rate || '') : 0;
    if (pence === null) local.unit_price_pence = 'Enter a price like 12.50';
    if (bp === null) local.rate_bp = 'Enter a percentage like 15';
    if (Object.keys(local).length) return setErrors(local);

    setBusy(true);
    setErrors({});
    setError('');
    const body = {
      category,
      name,
      description,
      unit: kind === 'standard' ? unit : 'item',
      kind,
      unit_price_pence: pence,
      rate_bp: bp,
      active,
    };
    try {
      const saved = item
        ? await api.put<PriceItem>(`/api/price-items/${item.id}`, body)
        : await api.post<PriceItem>('/api/price-items', body);
      toast(item ? 'Price updated' : 'Item added');
      onSaved(saved, !item);
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
      <TextField label="Name" value={name} onChange={setName} error={errors.name} autoFocus={!item} placeholder="e.g. Skim coat to walls" />
      <TextField
        label="Category"
        value={category}
        onChange={setCategory}
        error={errors.category}
        list="price-categories"
        hint="Pick one or type a new one"
      />
      <datalist id="price-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <TextArea label="Description" value={description} onChange={setDescription} error={errors.description} optional rows={2} hint="Shown on the quote under the item name" />
      <SelectField label="Type" value={kind} onChange={setKind} options={KIND_OPTIONS} />
      {kind === 'markup_percent' ? (
        <TextField label="Markup" value={rate} onChange={setRate} error={errors.rate_bp} inputMode="decimal" suffix="%" placeholder="15" />
      ) : (
        <div className="form-row cols-2">
          <TextField
            label={kind === 'minimum_charge' ? 'Minimum charge' : 'Price'}
            value={price}
            onChange={setPrice}
            error={errors.unit_price_pence}
            inputMode="decimal"
            prefix="£"
            placeholder="0.00"
            hint="Before VAT"
          />
          {kind === 'standard' && <SelectField label="Unit" value={unit} onChange={setUnit} options={UNIT_OPTIONS} error={errors.unit} />}
        </div>
      )}
      {item && <Toggle label="Show on quotes" checked={active} onChange={setActive} hint="Hidden items stay on old quotes but can’t be added to new ones." />}
      <div className="form-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {item ? 'Save' : 'Add item'}
        </Button>
      </div>
    </form>
  );
}

interface PreviewRow {
  line: number;
  category: string;
  name: string;
  unit: string;
  unit_price_pence: number | null;
  error?: string;
}

const TEMPLATE_CSV = 'category,name,description,unit,price\nPlastering,Skim coat to walls,Two-coat skim,m2,12.00\nLabour,Tradesman day rate,,day,220.00\n';

function ImportForm({ onDone, onCancel }: { onDone: (items: PriceItem[]) => void; onCancel: () => void }) {
  const toast = useToast();
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; validCount: number; errorCount: number } | null>(null);
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 500_000) return setError('That file is too big. Please keep it under 500 KB.');
    setCsv(await file.text());
    setPreview(null);
  }

  async function run(mode: 'preview' | 'import') {
    setBusy(true);
    setError('');
    try {
      if (mode === 'preview') {
        setPreview(await api.post('/api/price-items/import', { csv, mode }));
      } else {
        const res = await api.post<{ imported: number; skipped: number; items: PriceItem[] }>('/api/price-items/import', {
          csv,
          mode,
          replace,
        });
        toast(`${res.imported} item${res.imported === 1 ? '' : 's'} imported${res.skipped ? `, ${res.skipped} skipped` : ''}`);
        onDone(res.items);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <p className="small muted">
        Save your spreadsheet as CSV. The first row needs the column names <strong>name</strong>, <strong>unit</strong> and{' '}
        <strong>price</strong>. <strong>category</strong> and <strong>description</strong> are optional.{' '}
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`} download="price-list-template.csv">
          Download a template
        </a>
        .
      </p>
      {error && <Banner>{error}</Banner>}

      {!preview && (
        <>
          <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer' }}>
            <Icon name="upload" /> Choose a CSV file
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => readFile(e.target.files?.[0])} />
          </label>
          <TextArea label="…or paste it here" value={csv} onChange={(v) => (setCsv(v), setPreview(null))} rows={6} placeholder={TEMPLATE_CSV} />
          <div className="form-actions">
            <Button onClick={onCancel}>Cancel</Button>
            <Button variant="primary" onClick={() => run('preview')} disabled={!csv.trim()} loading={busy}>
              Check the file
            </Button>
          </div>
        </>
      )}

      {preview && (
        <>
          <Banner kind={preview.errorCount ? 'warn' : 'ok'}>
            {preview.validCount} item{preview.validCount === 1 ? '' : 's'} ready to import
            {preview.errorCount > 0 && `. ${preview.errorCount} row${preview.errorCount === 1 ? ' has a problem' : 's have problems'} and will be skipped`}.
          </Banner>
          <div className="table-wrap" style={{ maxHeight: 300 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Item</th>
                  <th>Unit</th>
                  <th className="num">Price</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className={r.error ? 'row-error' : ''}>
                    <td>{r.line}</td>
                    <td>
                      <div className="strong">{r.name || '—'}</div>
                      <div className="tiny muted">{r.error ?? r.category}</div>
                    </td>
                    <td>{r.unit ? unitLabel(r.unit) : '—'}</td>
                    <td className="num">{r.unit_price_pence !== null ? formatMoney(r.unit_price_pence) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            <span>
              <strong>Replace my current price list</strong>
              <br />
              <span className="small muted">Your current items will be hidden (not deleted). Leave unticked to add to the list.</span>
            </span>
          </label>
          <div className="form-actions">
            <Button onClick={() => setPreview(null)}>Back</Button>
            <Button variant="primary" onClick={() => run('import')} disabled={preview.validCount === 0} loading={busy}>
              Import {preview.validCount} item{preview.validCount === 1 ? '' : 's'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
