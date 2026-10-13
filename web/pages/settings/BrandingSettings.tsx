import { useEffect, useState } from 'react';
import { contrastRatio, isHexColour } from '../../../shared/colour';
import { formatMoney } from '../../../shared/format';
import { api, errorMessage } from '../../api';
import { useToast } from '../../components/toast';
import { Banner, BrandMark, Button, Pill } from '../../components/ui';
import { shrinkImage } from '../../images';
import { applyBrand, useBusiness, useSession } from '../../session';
import type { Business } from '../../types';

// A spread of strong colours that work with white text.
const SWATCHES = ['#2d6a4f', '#1f5f8b', '#1d3557', '#5b3f8c', '#9b2c2c', '#b4521b', '#a16207', '#0f766e', '#374151', '#111827'];

export function BrandingSettings() {
  const business = useBusiness();
  const { setBusiness } = useSession();
  const toast = useToast();
  const [colour, setColour] = useState(business.brand_colour);
  const [hexInput, setHexInput] = useState(business.brand_colour);
  const [busy, setBusy] = useState<'colour' | 'logo' | null>(null);
  const [error, setError] = useState('');

  // Live preview across the whole app; put it back if they leave without saving.
  useEffect(() => {
    applyBrand(colour);
  }, [colour]);
  useEffect(() => () => applyBrand(business.brand_colour), [business.brand_colour]);

  const lightColour = contrastRatio(colour, '#ffffff') < 3;

  function pick(hex: string) {
    setColour(hex);
    setHexInput(hex);
  }

  async function saveColour() {
    setBusy('colour');
    setError('');
    try {
      const saved = await api.put<Business>('/api/business', { brand_colour: colour });
      setBusiness({ ...business, ...saved });
      toast('Colour saved');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    setBusy('logo');
    setError('');
    try {
      const form = new FormData();
      form.append('logo', await shrinkImage(file, 800, 0.9));
      const saved = await api.upload<Business>('/api/business/logo', form);
      setBusiness({ ...business, ...saved });
      toast('Logo updated');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function removeLogo() {
    setBusy('logo');
    try {
      const saved = await api.del<Business>('/api/business/logo');
      setBusiness({ ...business, ...saved });
      toast('Logo removed');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      {error && <Banner>{error}</Banner>}

      <section className="card card-pad form" aria-labelledby="logo-h">
        <h2 id="logo-h">Logo</h2>
        <div className="logo-drop">
          <div className="logo-frame">
            {business.logo_url ? <img src={business.logo_url} alt="Your logo" /> : <BrandMark name={business.name} logoUrl={null} size={64} />}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }} aria-busy={busy === 'logo'}>
              {busy === 'logo' ? <span className="spinner" aria-hidden="true" /> : null}
              {business.logo_url ? 'Change logo' : 'Upload logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => uploadLogo(e.target.files?.[0])} />
            </label>
            {business.logo_url && (
              <Button variant="ghost" size="sm" onClick={removeLogo} disabled={busy === 'logo'}>
                Remove
              </Button>
            )}
          </div>
        </div>
        <p className="small muted">PNG or JPEG. A square logo, or one on a white background, works best. Without a logo we show your initials.</p>
      </section>

      <section className="card card-pad form" aria-labelledby="colour-h">
        <h2 id="colour-h">Brand colour</h2>
        <div className="colour-swatches" role="group" aria-label="Suggested colours">
          {SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              style={{ background: hex }}
              aria-label={`Use colour ${hex}`}
              aria-pressed={colour.toLowerCase() === hex}
              onClick={() => pick(hex)}
            />
          ))}
        </div>
        <div className="colour-input-row">
          <input type="color" value={colour} onChange={(e) => pick(e.target.value)} aria-label="Pick any colour" />
          <input
            className="input"
            style={{ maxWidth: 160 }}
            value={hexInput}
            aria-label="Colour code"
            onChange={(e) => {
              const v = e.target.value.trim();
              setHexInput(v);
              if (isHexColour(v)) setColour(v.toLowerCase());
            }}
          />
        </div>
        {lightColour && (
          <Banner kind="warn">This is a light colour. We’ll darken it for text and use dark text on buttons so everything stays readable.</Banner>
        )}

        <div className="brand-preview" aria-label="Preview of what your customers see">
          <div className="bp-head">
            <BrandMark name={business.name} logoUrl={business.logo_url} size={40} />
            <div>
              <div className="strong">{business.name}</div>
              <div className="tiny muted">Quote Q-0042 · Tue 13 Oct</div>
            </div>
          </div>
          <div className="bp-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Re-plaster back bedroom</span>
              <Pill kind="brand">Waiting for you</Pill>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted">Total including VAT</span>
              <strong className="money">{formatMoney(118800)}</strong>
            </div>
            <Button variant="primary" block>
              Accept quote
            </Button>
          </div>
        </div>

        <div className="form-actions">
          <Button onClick={() => pick(business.brand_colour)} disabled={colour === business.brand_colour}>
            Undo
          </Button>
          <Button variant="primary" onClick={saveColour} loading={busy === 'colour'} disabled={colour === business.brand_colour}>
            Save colour
          </Button>
        </div>
      </section>
    </div>
  );
}
