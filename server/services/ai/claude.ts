import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { unitLabel } from '../../../shared/format';
import { SUGGESTION_JSON_SCHEMA, parseSuggestionJson, type PriceListItem, type RawSuggestion } from './suggestion';

export const DEFAULT_MODEL = 'claude-opus-5-5';

const MEDIA_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export interface EstimateInput {
  brief: string;
  trade: string;
  businessName: string;
  priceList: PriceListItem[];
  /** Absolute paths of up to 4 photos. */
  photoPaths: string[];
}

/** The system prompt is stable per business (good for prompt caching): instructions + price list. */
export function buildSystemPrompt(trade: string, businessName: string, priceList: PriceListItem[]): string {
  const items = priceList
    .filter((p) => p.active && p.kind === 'standard')
    .map((p) => `${p.id} | ${p.name} | per ${unitLabel(p.unit)}${p.description ? ` | ${p.description}` : ''}`)
    .join('\n');
  return `You are an estimator for ${businessName}, a UK ${trade || 'building'} business.

Turn the owner's job description (and any photos) into quote line items, using ONLY the price list items below and their units.

Rules:
- Match each piece of work to the closest price list item and give its id in price_item_id. Use that item's unit.
- Work out sensible quantities from any measurements given. For walls, assume 2.4m high unless told otherwise; wall area is the room's perimeter times the height. Ceiling area is length times width.
- If no price list item covers something, still add it as a line with price_item_id null and needs_price true.
- Never include prices. Prices come from the price list, not from you.
- Write descriptions the customer will read: short, plain British English, no jargon.
- Add sensible exclusions (e.g. decorating) and a few questions worth asking the customer before confirming.
- List any assumptions you made, especially about measurements.
- Don't add items for things the owner didn't ask for, except obvious essentials like floor protection or waste removal.

Price list (id | name | unit | description):
${items}`;
}

function imageBlock(filePath: string): Anthropic.ImageBlockParam | null {
  const mediaType = MEDIA_TYPES[path.extname(filePath).toLowerCase()];
  if (!mediaType || !fs.existsSync(filePath)) return null;
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: fs.readFileSync(filePath).toString('base64') } };
}

export class ClaudeRefusalError extends Error {}

/** One Claude call: description + photos + price list in, structured line items out. */
export async function estimateWithClaude(
  client: Anthropic,
  model: string,
  input: EstimateInput,
  timeoutMs = 30_000,
): Promise<RawSuggestion> {
  const images = input.photoPaths.slice(0, 4).map(imageBlock).filter((b): b is Anthropic.ImageBlockParam => b !== null);
  const text = input.brief.trim()
    ? `Job description from the owner:\n${input.brief.trim()}`
    : 'There is no written description. Work out the job from the photos.';

  const response = await client.beta.messages.create(
    {
      model,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SUGGESTION_JSON_SCHEMA } },
      system: [{ type: 'text', text: buildSystemPrompt(input.trade, input.businessName, input.priceList), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [...images, { type: 'text', text }] }],
    },
    { timeout: timeoutMs, maxRetries: 1 },
  );

  if (response.stop_reason === 'refusal') throw new ClaudeRefusalError('The AI declined this request.');
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('The AI reply had no text.');
  return parseSuggestionJson(block.text);
}
