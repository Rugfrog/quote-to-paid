import type { PriceListItem, RawSuggestion } from './suggestion';

/**
 * Demo-mode estimator: works offline with no API key. It reads the description for the
 * usual plastering and building jobs and any measurements ("4 by 3 metres", "40m²"),
 * then picks items from the price list by name. Realistic enough for a sales demo.
 */

const WALL_HEIGHT = 2.4;
const NUMBER_WORDS: Record<string, number> = { one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2 };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function readDimensions(text: string): { length?: number; width?: number; area?: number; wide?: number } {
  const t = text.toLowerCase();
  const out: { length?: number; width?: number; area?: number; wide?: number } = {};
  const unit = '\\s*(?:m|metres?|meters?|mtrs?)?';
  const room = new RegExp(`(\\d+(?:\\.\\d+)?)${unit}\\s*(?:x|by|×|\\*)\\s*(\\d+(?:\\.\\d+)?)${unit}`).exec(t);
  if (room) {
    out.length = Number(room[1]);
    out.width = Number(room[2]);
  }
  const area = /(\d+(?:\.\d+)?)\s*(?:m2|m²|sq\.?\s*m|square\s*met(?:re|er)s?)/.exec(t);
  if (area) out.area = Number(area[1]);
  const wide = /(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s*(?:wide|long)/.exec(t);
  if (wide) out.wide = Number(wide[1]);
  return out;
}

function countOf(text: string, noun: RegExp): number | undefined {
  const m = new RegExp(`(\\d+|${Object.keys(NUMBER_WORDS).join('|')})\\s+${noun.source}`).exec(text.toLowerCase());
  if (!m) return undefined;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
}

export function demoSuggestion(brief: string, priceList: PriceListItem[], photoCount = 0): RawSuggestion {
  const t = brief.toLowerCase();
  const has = (re: RegExp) => re.test(t);
  const items = priceList.filter((p) => p.active && p.kind === 'standard');
  const find = (name: RegExp) => items.find((p) => name.test(p.name.toLowerCase()));

  const lines: RawSuggestion['lines'] = [];
  const assumptions: string[] = [];
  const questions: string[] = [];
  const exclusions = new Set<string>();

  const add = (name: RegExp, quantity: number, description?: string) => {
    const item = find(name);
    if (item) lines.push({ description: description ?? item.name, quantity: round1(quantity), unit: item.unit, price_item_id: item.id, needs_price: false });
    else lines.push({ description: description ?? name.source, quantity: round1(quantity), unit: 'item', price_item_id: null, needs_price: true });
  };
  const flag = (description: string, quantity = 1, unit = 'item') =>
    lines.push({ description, quantity, unit, price_item_id: null, needs_price: true });

  // Measurements
  const dims = readDimensions(brief);
  let length = dims.length;
  let width = dims.width;
  const isRoom = has(/bedroom|room|lounge|kitchen|hall|bathroom|dining|landing|stair|extension|downstairs|upstairs/);
  if (!length && !width && isRoom && !dims.area) {
    if (has(/small|box ?room|bathroom|toilet|wc|cloakroom/)) [length, width] = [2.5, 2];
    else if (has(/large|big|whole|throughout|downstairs|extension/)) [length, width] = [5, 4];
    else [length, width] = [4, 3];
    assumptions.push(`No size given: assumed a ${length}m × ${width}m room`);
    questions.push('Can you confirm the room measurements?');
  }
  const floorArea = length && width ? length * width : dims.area;
  const wallArea = length && width ? 2 * (length + width) * WALL_HEIGHT : dims.area;
  if (length && width) {
    assumptions.push(`Room ${length}m × ${width}m with ${WALL_HEIGHT}m walls: ${round1(wallArea!)} m² of wall, ${round1(floorArea!)} m² of ceiling`);
  }

  let interior = false;

  // Walls
  if (has(/re-?plaster|hack(ed|ing)? off|blown|coming away/) && !has(/ceiling only/)) {
    if (has(/wall|room|bedroom|bathroom|kitchen|lounge|hall/) || !has(/ceiling/)) {
      add(/hack off and re-plaster/, wallArea ?? 30, 'Hack off and re-plaster walls');
      add(/remove and dispose of old plaster/, wallArea ?? 30);
      interior = true;
      exclusions.add('Moving sockets, switches or radiators');
      questions.push('Is there any damp in the walls?');
      if ((wallArea ?? 30) > 25) add(/mini skip/, 1);
      else add(/waste removal/, 1);
    }
  } else if (has(/skim/) && !has(/ceiling only/) && (has(/wall|room|throughout|downstairs|lounge|hall|dining|bedroom/) || !has(/ceiling/))) {
    add(/skim coat to walls/, wallArea ?? 30, 'Skim coat to walls');
    add(/seal and stabilise/, wallArea ?? 30);
    interior = true;
  }

  // Ceilings
  if (has(/ceiling/) && !has(/artex/)) {
    if (has(/overboard|cracked|lath|sagging|bowing|falling/)) add(/overboard and skim ceiling/, floorArea ?? 12);
    else add(/ceiling skim/, floorArea ?? 12);
    interior = true;
  }
  if (has(/artex/)) {
    add(/cover artex/, floorArea ?? (has(/hall|landing/) ? 10 : 12), 'Cover Artex ceiling');
    questions.push('Has the Artex been tested for asbestos? (Required if it went up before 2000.)');
    interior = true;
  }

  // Other plastering
  if (has(/coving|cornice/)) {
    if (has(/keep|original/)) exclusions.add('Existing cornice will be protected and kept');
    else add(/coving/, length && width ? 2 * (length + width) : 14, 'Coving, supply and fit');
  }
  if (has(/patch/)) {
    add(/patch repair/, countOf(t, /(patch(es)?|holes?|areas?|rooms?)/) ?? 1);
    interior = true;
  }
  if (has(/radiator/)) flag('Take off and refit radiator (plumber)');
  if (has(/tile|tiling/)) exclusions.add('Tiling');

  // Building work
  if (has(/stud|partition/)) {
    const wallLength = dims.wide ?? length ?? 4;
    add(/stud partition/, wallLength * WALL_HEIGHT, `Stud partition wall, ${wallLength}m long`);
    if (has(/door/)) flag('Form doorway in new wall, including lining');
    exclusions.add('Supplying and hanging the door');
    interior = true;
  }
  if (has(/lintel/)) {
    add(/lintel/, 1);
    if (has(/brick|crack/)) add(/brickwork/, 1, 'Rebuild cracked brickwork above opening');
    questions.push('Do you know if building control has been told? We can arrange it.');
  }
  if (has(/chimney/)) {
    add(/chimney breast/, 1);
    add(/skim coat to walls/, 6, 'Plaster wall where chimney breast was');
    add(/skip hire/, 1);
    exclusions.add('Building control fees');
    questions.push('Is the chimney breast upstairs staying? (It will need supporting.)');
    interior = true;
  }

  // Outside
  if (has(/render/)) {
    const area = dims.area ?? 40;
    if (has(/silicone|k-?rend|coloured/)) add(/silicone/, area);
    else add(/sand and cement render/, area);
    if (has(/old render|cracked|coming away|hack/)) add(/remove and dispose of old plaster/, area, 'Hack off old render and dispose');
    flag('Scaffolding (if needed)');
    exclusions.add('Painting the new render');
  }
  if (has(/pebble ?dash/)) add(/pebbledash/, dims.area ?? 5);

  // Nothing recognised
  if (lines.length === 0) {
    if (photoCount > 0) {
      add(/skim coat to walls/, 33.6, 'Skim coat to walls');
      add(/ceiling skim/, 12);
      assumptions.push('Demo mode can’t look at photos, so this is a typical 4m × 3m room. Check the measurements.');
      questions.push('Can you confirm the room measurements?');
      interior = true;
    } else {
      add(/tradesman day rate/, 1);
      flag(brief.trim().slice(0, 200) || 'Work as described');
      questions.push('Can you send a few photos so we can price this properly?');
    }
  }

  if (interior) {
    add(/floor and furniture protection/, 1);
    exclusions.add('Decorating (new plaster needs 2–4 weeks to dry first)');
    exclusions.add('Moving large furniture: please clear small items');
  }
  questions.push('Is there parking close to the property?');

  return {
    title: '',
    lines,
    exclusions: [...exclusions],
    questions: [...new Set(questions)].slice(0, 4),
    assumptions,
  };
}
