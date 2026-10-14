import { describe, expect, it } from 'vitest';
import { openDb } from '../db/db';
import { seedDemo } from '../db/seed';
import { createQuoteAi } from '../services/ai';
import { buildSystemPrompt } from '../services/ai/claude';
import { demoSuggestion, readDimensions } from '../services/ai/demo';
import { parseSuggestionJson, resolveSuggestion, SuggestionParseError, type PriceListItem } from '../services/ai/suggestion';

function priceList(): PriceListItem[] {
  const db = openDb(':memory:');
  seedDemo(db, { fastHash: true });
  return db.prepare('SELECT * FROM price_items ORDER BY sort_order').all() as PriceListItem[];
}

const byName = (list: PriceListItem[], name: string) => list.find((p) => p.name === name)!;

describe('parsing the AI reply (faked Claude response)', () => {
  const list = priceList();
  const skim = byName(list, 'Skim coat to walls');
  const ceiling = byName(list, 'Ceiling skim');

  const claudeReply = JSON.stringify({
    title: 'Re-plaster back bedroom',
    lines: [
      { description: 'Skim the walls', quantity: 33.6, unit: 'm2', price_item_id: skim.id, needs_price: false },
      { description: 'Skim the ceiling', quantity: 12, unit: 'each', price_item_id: ceiling.id, needs_price: false },
      { description: 'Replace rotten skirting', quantity: 14, unit: 'm', price_item_id: null, needs_price: true },
      { description: 'Made-up item', quantity: 1, unit: 'each', price_item_id: 99999, needs_price: false },
    ],
    exclusions: ['Decorating', 'Decorating', '  '],
    questions: ['Any damp?'],
    assumptions: ['Walls 2.4m high'],
  });

  it('takes prices and units from the price list, never from the AI', () => {
    const s = resolveSuggestion(parseSuggestionJson(claudeReply), list);
    expect(s.lines[0]).toMatchObject({ quantity_x100: 3360, unit: 'm2', unit_price_pence: skim.unit_price_pence, price_item_id: skim.id });
    // The AI said "each" but the price list item is per m²: the price list wins.
    expect(s.lines[1]).toMatchObject({ unit: 'm2', unit_price_pence: ceiling.unit_price_pence });
  });

  it('flags anything not on the price list as "check price" with no price', () => {
    const s = resolveSuggestion(parseSuggestionJson(claudeReply), list);
    expect(s.lines[2]).toMatchObject({ description: 'Replace rotten skirting', unit: 'm', unit_price_pence: null, price_item_id: null });
    // An id that doesn't exist is treated the same: no invented prices.
    expect(s.lines[3]).toMatchObject({ unit_price_pence: null, price_item_id: null, unit: 'each' });
  });

  it('ignores a price even if the AI sneaks one in', () => {
    const sneaky = JSON.stringify({
      title: '',
      lines: [{ description: 'Skim', quantity: 10, unit: 'm2', price_item_id: skim.id, needs_price: false, unit_price_pence: 1 }],
      exclusions: [],
      questions: [],
      assumptions: [],
    });
    expect(resolveSuggestion(parseSuggestionJson(sneaky), list).lines[0].unit_price_pence).toBe(skim.unit_price_pence);
  });

  it('won’t price markup or minimum-charge items, or hidden ones', () => {
    const markup = list.find((p) => p.kind === 'markup_percent')!;
    const hiddenList = list.map((p) => (p.id === skim.id ? { ...p, active: 0 } : p));
    const raw = {
      title: '',
      lines: [
        { description: 'Markup', quantity: 1, unit: 'item', price_item_id: markup.id, needs_price: false },
        { description: 'Skim', quantity: 1, unit: 'm2', price_item_id: skim.id, needs_price: false },
      ],
      exclusions: [],
      questions: [],
      assumptions: [],
    };
    const s = resolveSuggestion(raw, hiddenList);
    expect(s.lines.every((l) => l.unit_price_pence === null)).toBe(true);
  });

  it('tidies lists and fixes silly quantities', () => {
    const s = resolveSuggestion(
      {
        title: '  Big   job ',
        lines: [{ description: 'x', quantity: -5, unit: 'zzz', price_item_id: null, needs_price: true }],
        exclusions: ['Decorating', 'Decorating', ''],
        questions: [],
        assumptions: [],
      },
      list,
    );
    expect(s.title).toBe('Big job');
    expect(s.lines[0]).toMatchObject({ quantity_x100: 100, unit: 'item' });
    expect(s.exclusions).toEqual(['Decorating']);
  });

  it('rejects replies that aren’t JSON or have the wrong shape', () => {
    expect(() => parseSuggestionJson('Sure! Here is your quote:')).toThrow(SuggestionParseError);
    expect(() => parseSuggestionJson(JSON.stringify({ lines: 'nope' }))).toThrow(SuggestionParseError);
  });

  it('sends the price list (without prices) in the system prompt', () => {
    const prompt = buildSystemPrompt('plastering', 'Holme Valley', list);
    expect(prompt).toContain(`${skim.id} | Skim coat to walls | per m²`);
    expect(prompt).not.toContain('£');
    expect(prompt).not.toContain('Materials markup'); // only standard items
  });
});

describe('the estimator wrapper', () => {
  const list = priceList();
  const input = { brief: 'Skim the lounge ceiling, 5 by 4', trade: 'plastering', businessName: 'HV', priceList: list, photoPaths: [] };

  it('uses demo mode when there’s no API key', async () => {
    const ai = createQuoteAi();
    expect(ai.enabled).toBe(false);
    const r = await ai.suggest(input);
    expect(r.mode).toBe('demo');
    expect(r.suggestion.lines.find((l) => l.description === 'Ceiling skim')?.quantity_x100).toBe(2000);
  });

  it('uses the AI when it works', async () => {
    const ai = createQuoteAi({
      estimate: async () => ({
        title: 'Lounge ceiling',
        lines: [{ description: 'Skim ceiling', quantity: 20, unit: 'm2', price_item_id: byName(list, 'Ceiling skim').id, needs_price: false }],
        exclusions: [],
        questions: [],
        assumptions: [],
      }),
    });
    const r = await ai.suggest(input);
    expect(r).toMatchObject({ mode: 'claude' });
    expect(r.suggestion.lines).toHaveLength(1);
  });

  it('falls back to demo mode with a friendly notice if the AI fails', async () => {
    const ai = createQuoteAi({ estimate: async () => Promise.reject(new Error('timeout')) });
    const r = await ai.suggest(input);
    expect(r.mode).toBe('demo');
    expect(r.notice).toMatch(/didn’t respond/);
    expect(r.suggestion.lines.length).toBeGreaterThan(0);
  });

  it('stops using the AI after the daily limit', async () => {
    let calls = 0;
    const ai = createQuoteAi({
      dailyLimit: 2,
      estimate: async () => {
        calls++;
        return { title: '', lines: [{ description: 'x', quantity: 1, unit: 'item', price_item_id: null, needs_price: true }], exclusions: [], questions: [], assumptions: [] };
      },
    });
    await ai.suggest(input);
    await ai.suggest(input);
    const third = await ai.suggest(input);
    expect(calls).toBe(2);
    expect(third.mode).toBe('demo');
    expect(third.notice).toMatch(/limit/);
  });
});

describe('demo mode estimator', () => {
  const list = priceList();

  it('reads measurements written in different ways', () => {
    expect(readDimensions('about 4 by 3 metres')).toMatchObject({ length: 4, width: 3 });
    expect(readDimensions('4m x 3.5m')).toMatchObject({ length: 4, width: 3.5 });
    expect(readDimensions('render about 40m²')).toMatchObject({ area: 40 });
    expect(readDimensions('room is about 5m wide')).toMatchObject({ wide: 5 });
  });

  it('prices the sales-demo voice note sensibly', () => {
    const s = resolveSuggestion(demoSuggestion('Re-plaster the back bedroom, about 4 by 3 metres, skim the ceiling too', list), list);
    const line = (name: string) => s.lines.find((l) => l.description === name);
    expect(line('Hack off and re-plaster walls')?.quantity_x100).toBe(3360); // (4+3)×2×2.4
    expect(line('Ceiling skim')?.quantity_x100).toBe(1200);
    expect(line('Floor and furniture protection')).toBeDefined();
    expect(s.lines.every((l) => l.unit_price_pence !== null)).toBe(true);
    expect(s.exclusions.join(' ')).toMatch(/Decorating/);
    expect(s.assumptions.join(' ')).toMatch(/33.6 m²/);
  });

  it('flags work that isn’t on the price list', () => {
    const s = resolveSuggestion(demoSuggestion('Patch two holes where the radiator was moved', list), list);
    expect(s.lines.find((l) => l.description.startsWith('Patch repair'))?.quantity_x100).toBe(200);
    expect(s.lines.find((l) => /radiator/i.test(l.description))?.unit_price_pence).toBeNull();
  });

  it('always gives a starting point, even for vague requests', () => {
    const s = resolveSuggestion(demoSuggestion('Sort out the garden wall', list), list);
    expect(s.lines.length).toBeGreaterThan(0);
    expect(s.lines.some((l) => l.unit_price_pence === null)).toBe(true);
  });
});
