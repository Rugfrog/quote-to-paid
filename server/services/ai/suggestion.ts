import { z } from 'zod';
import { UNITS } from '../../../shared/schemas';

/** What an estimator (Claude or the demo) returns, before prices are attached. */
export interface RawSuggestion {
  title: string;
  lines: { description: string; quantity: number; unit: string; price_item_id: number | null; needs_price: boolean }[];
  exclusions: string[];
  questions: string[];
  assumptions: string[];
}

/** A suggestion ready to put on a quote. Prices come only from the price list. */
export interface Suggestion {
  title: string;
  lines: {
    description: string;
    quantity_x100: number;
    unit: (typeof UNITS)[number];
    unit_price_pence: number | null;
    price_item_id: number | null;
  }[];
  exclusions: string[];
  questions: string[];
  assumptions: string[];
}

export interface PriceListItem {
  id: number;
  name: string;
  description: string;
  unit: string;
  unit_price_pence: number;
  kind: string;
  active: number | boolean;
}

/** The JSON schema Claude must follow (structured outputs). Note: no price field at all. */
export const SUGGESTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'lines', 'exclusions', 'questions', 'assumptions'],
  properties: {
    title: { type: 'string', description: 'Short job title for the quote, e.g. "Re-plaster back bedroom"' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'quantity', 'unit', 'price_item_id', 'needs_price'],
        properties: {
          description: { type: 'string', description: 'What the customer will see, in plain British English' },
          quantity: { type: 'number', description: 'How many units, e.g. 33.6 for 33.6 m²' },
          unit: { type: 'string', enum: [...UNITS] },
          price_item_id: {
            anyOf: [{ type: 'integer' }, { type: 'null' }],
            description: 'The id of the matching price list item, or null if nothing on the list covers it',
          },
          needs_price: { type: 'boolean', description: 'true when price_item_id is null' },
        },
      },
    },
    exclusions: { type: 'array', items: { type: 'string' }, description: 'Things not included, e.g. "Decorating"' },
    questions: { type: 'array', items: { type: 'string' }, description: 'Questions to ask the customer before confirming' },
    assumptions: { type: 'array', items: { type: 'string' }, description: 'Assumptions made, e.g. "Walls 2.4m high"' },
  },
} as const;

const rawSchema = z.object({
  title: z.string().default(''),
  lines: z
    .array(
      z.object({
        description: z.string(),
        quantity: z.number(),
        unit: z.string(),
        price_item_id: z.number().int().nullable(),
        needs_price: z.boolean().default(false),
      }),
    )
    .default([]),
  exclusions: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
});

export class SuggestionParseError extends Error {}

/** Parse Claude's JSON text. Throws SuggestionParseError if it isn't usable. */
export function parseSuggestionJson(text: string): RawSuggestion {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SuggestionParseError('The AI reply wasn’t valid JSON.');
  }
  const result = rawSchema.safeParse(json);
  if (!result.success) throw new SuggestionParseError('The AI reply didn’t match the expected shape.');
  return result.data;
}

const tidy = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Attach prices. The golden rule: a line is priced only if it points at a real, active,
 * standard item on the business's price list, and then the price (and unit) come from
 * that item, never from the estimator. Everything else is flagged "check price".
 */
export function resolveSuggestion(raw: RawSuggestion, priceList: PriceListItem[]): Suggestion {
  const byId = new Map(priceList.filter((p) => p.active && p.kind === 'standard').map((p) => [p.id, p]));
  const lines: Suggestion['lines'] = [];
  for (const line of raw.lines.slice(0, 40)) {
    const item = line.price_item_id !== null ? byId.get(line.price_item_id) : undefined;
    const quantity = Number.isFinite(line.quantity) && line.quantity > 0 ? Math.min(line.quantity, 100_000) : 1;
    const quantity_x100 = Math.max(1, Math.round(quantity * 100));
    const description = tidy(line.description, 500) || item?.name || '';
    if (!description) continue;
    if (item) {
      lines.push({
        description,
        quantity_x100,
        unit: item.unit as Suggestion['lines'][number]['unit'],
        unit_price_pence: item.unit_price_pence,
        price_item_id: item.id,
      });
    } else {
      lines.push({
        description,
        quantity_x100,
        unit: (UNITS as readonly string[]).includes(line.unit) ? (line.unit as Suggestion['lines'][number]['unit']) : 'item',
        unit_price_pence: null,
        price_item_id: null,
      });
    }
  }
  const list = (xs: string[], max: number) => [...new Set(xs.map((x) => tidy(x, 200)).filter(Boolean))].slice(0, max);
  return {
    title: tidy(raw.title, 120),
    lines,
    exclusions: list(raw.exclusions, 10),
    questions: list(raw.questions, 8),
    assumptions: list(raw.assumptions, 8),
  };
}
