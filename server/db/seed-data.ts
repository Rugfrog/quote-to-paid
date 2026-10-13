/**
 * Demo business: Holme Valley Plastering & Building, Huddersfield.
 * All details are made up. Phone numbers use Ofcom's drama range (07700 900xxx),
 * emails use example.com, and the VAT number and bank details are examples.
 */

export const demoBusiness = {
  name: 'Holme Valley Plastering & Building',
  trade: 'plastering and general building',
  owner_name: 'Gary Firth',
  address_line1: 'Unit 4, Bridge Mills',
  address_line2: 'Huddersfield Road',
  town: 'Holmfirth',
  postcode: 'HD9 3TW',
  phone: '07700 900123',
  email: 'holmevalleyplastering@example.com',
  website: 'www.example.com',
  brand_colour: '#2d6a4f',
  vat_registered: 1,
  vat_number: 'GB 123 4567 89 (example)',
  vat_rate_bp: 2000,
  bank_name: 'Example Bank',
  account_name: 'Holme Valley Plastering & Building',
  sort_code: '12-34-56',
  account_number: '12345678',
  default_validity_days: 30,
  default_deposit_bp: 2500,
  payment_terms_days: 14,
  quote_terms: [
    'Prices include labour, materials and clearing up after ourselves, unless listed under “Not included”.',
    'This quote is valid for 30 days from the date shown.',
    'If a deposit is shown, we’ll book your start date once it’s received. It comes off your final invoice.',
    'Any extra work we find once we start (for example rotten timber or loose brickwork) will be agreed with you in writing before we do it.',
    'Please clear small items and fragile things from the rooms we’re working in. We’ll protect floors and large furniture.',
    'New plaster needs 2–4 weeks to dry before decorating. Use a mist coat first.',
    'Payment is due within 14 days of the invoice date by bank transfer, card or cash.',
  ].join('\n'),
};

export const demoUsers = [
  { email: 'gary@example.com', name: 'Gary Firth', password: 'demo1234', role: 'owner' },
  { email: 'admin@example.com', name: 'Agency admin', password: 'agency1234', role: 'agency' },
] as const;

export const demoTeam = [
  { name: 'Gary Firth', phone: '07700 900123', role_label: 'Owner / plasterer' },
  { name: 'Dean Whitwam', phone: '07700 900456', role_label: 'Plasterer' },
  { name: 'Liam Kaye', phone: '07700 900789', role_label: 'Labourer' },
];

type Seed = {
  category: string;
  name: string;
  description?: string;
  unit: 'm2' | 'm' | 'each' | 'day' | 'hour' | 'item';
  price: number; // pence
  kind?: 'standard' | 'markup_percent' | 'minimum_charge';
  rate_bp?: number;
};

export const demoPriceList: Seed[] = [
  // Plastering
  { category: 'Plastering', name: 'Skim coat to walls', description: 'Two-coat multi-finish skim over sound plaster or board', unit: 'm2', price: 1200 },
  { category: 'Plastering', name: 'Hack off and re-plaster walls', description: 'Remove old plaster to brick, bond and skim', unit: 'm2', price: 3200 },
  { category: 'Plastering', name: 'Ceiling skim', description: 'Skim existing ceiling, including PVA', unit: 'm2', price: 1500 },
  { category: 'Plastering', name: 'Overboard and skim ceiling', description: '12.5mm plasterboard fixed over existing ceiling, scrimmed and skimmed', unit: 'm2', price: 2800 },
  { category: 'Plastering', name: 'Dot and dab plasterboard to walls', description: 'Board on adhesive dabs, then skim', unit: 'm2', price: 2400 },
  { category: 'Plastering', name: 'Patch repair (up to 1m²)', description: 'Cut out, bond and skim a damaged area', unit: 'each', price: 8500 },
  { category: 'Plastering', name: 'Cover Artex ceiling', description: 'Scrape high points, seal and skim over Artex (asbestos test not included)', unit: 'm2', price: 1800 },
  { category: 'Plastering', name: 'Coving, supply and fit', description: '127mm plaster coving, mitred corners', unit: 'm', price: 1400 },
  { category: 'Plastering', name: 'Angle bead to corners', description: 'Galvanised beads to external corners and reveals', unit: 'm', price: 650 },
  // Rendering
  { category: 'Rendering', name: 'Sand and cement render', description: 'Two-coat render to exterior walls', unit: 'm2', price: 4500 },
  { category: 'Rendering', name: 'Silicone through-coloured render', description: 'Thin-coat coloured render system with beads', unit: 'm2', price: 6500 },
  { category: 'Rendering', name: 'Pebbledash repair', description: 'Patch and re-dash to match as closely as possible', unit: 'm2', price: 5500 },
  // Building
  { category: 'Building', name: 'Stud partition wall', description: 'Timber stud, boarded both sides and skimmed', unit: 'm2', price: 8500 },
  { category: 'Building', name: 'Lintel, supply and fit (up to 1.2m)', description: 'Remove old lintel, fit new concrete or steel lintel, make good', unit: 'each', price: 18000 },
  { category: 'Building', name: 'Brickwork', description: 'Facing or common brick, including mortar', unit: 'm2', price: 11000 },
  { category: 'Building', name: 'Remove chimney breast (ground floor)', description: 'Remove breast, support stack with gallows brackets, make good (building control fees extra)', unit: 'each', price: 65000 },
  // Labour
  { category: 'Labour', name: 'Tradesman day rate', unit: 'day', price: 22000 },
  { category: 'Labour', name: 'Labourer day rate', unit: 'day', price: 14000 },
  { category: 'Labour', name: 'Hourly rate (small jobs)', unit: 'hour', price: 3500 },
  // Preparation
  { category: 'Preparation', name: 'Floor and furniture protection', description: 'Dust sheets, Correx and masking', unit: 'item', price: 4500 },
  { category: 'Preparation', name: 'Remove and dispose of old plaster', unit: 'm2', price: 800 },
  { category: 'Preparation', name: 'Seal and stabilise surfaces', description: 'PVA or stabilising solution before skimming', unit: 'm2', price: 250 },
  // Waste
  { category: 'Waste', name: 'Skip hire (6 yard)', description: 'Delivered, collected and permit if on the road', unit: 'each', price: 29500 },
  { category: 'Waste', name: 'Mini skip (4 yard)', unit: 'each', price: 23500 },
  { category: 'Waste', name: 'Waste removal (van load)', description: 'Licensed waste carrier', unit: 'each', price: 12000 },
  // Charges
  { category: 'Charges', name: 'Materials markup', description: 'Added to materials bought in specially for the job', unit: 'item', price: 0, kind: 'markup_percent', rate_bp: 1500 },
  { category: 'Charges', name: 'Minimum call-out charge', description: 'The least we charge for any visit', unit: 'item', price: 15000, kind: 'minimum_charge' },
];

export const demoCustomers = [
  { name: 'Susan Hirst', phone: '07700 900201', email: 'susan.hirst@example.com', address_line1: '14 Thornhill Road', address_line2: 'Lindley', town: 'Huddersfield', postcode: 'HD3 3DE', notes: 'Prefers a call after 4pm.' },
  { name: 'Mark Sykes', phone: '07700 900202', email: 'mark.sykes@example.com', address_line1: '7 Cooper Lane', address_line2: '', town: 'Holmfirth', postcode: 'HD9 2QA', notes: '' },
  { name: 'Priya Patel', phone: '07700 900203', email: 'priya.patel@example.com', address_line1: '32 Edgerton Grove Road', address_line2: 'Edgerton', town: 'Huddersfield', postcode: 'HD1 5JT', notes: 'Victorian semi. Park on the drive.' },
  { name: 'David Haigh', phone: '07700 900204', email: 'd.haigh@example.com', address_line1: '3 Woodhead Road', address_line2: 'Honley', town: 'Holmfirth', postcode: 'HD9 6AZ', notes: '' },
  { name: 'Rachel Brook', phone: '07700 900205', email: 'rachel.brook@example.com', address_line1: '21 Peel Street', address_line2: '', town: 'Marsden', postcode: 'HD7 6BW', notes: 'Has a dog — keep the back gate shut.' },
  { name: 'Tom Armitage', phone: '07700 900206', email: 'tom.armitage@example.com', address_line1: '9 Scar Lane', address_line2: 'Golcar', town: 'Huddersfield', postcode: 'HD7 4JQ', notes: '' },
  { name: 'Margaret Lockwood', phone: '07700 900207', email: '', address_line1: '56 Northgate', address_line2: 'Almondbury', town: 'Huddersfield', postcode: 'HD5 8PU', notes: 'No email — send things by text.' },
  { name: 'Imran Hussain', phone: '07700 900208', email: 'imran.hussain@example.com', address_line1: '118 Bradford Road', address_line2: 'Fartown', town: 'Huddersfield', postcode: 'HD2 1BN', notes: '' },
  { name: 'Claire Walker', phone: '07700 900209', email: 'claire.walker@example.com', address_line1: '4 Shelley Lane', address_line2: 'Kirkburton', town: 'Huddersfield', postcode: 'HD8 0RX', notes: '' },
  { name: 'Steve Beaumont', phone: '07700 900210', email: 'steve.beaumont@example.com', address_line1: '27 Huddersfield Road', address_line2: '', town: 'Meltham', postcode: 'HD9 5LP', notes: 'Recommended by Mark Sykes.' },
  { name: 'Helen Dyson', phone: '07700 900211', email: 'helen.dyson@example.com', address_line1: '12 Carr Lane', address_line2: '', town: 'Slaithwaite', postcode: 'HD7 5HB', notes: '' },
  { name: 'Kirklees Lettings (example)', phone: '07700 900212', email: 'lettings@example.com', address_line1: '2 Market Street', address_line2: '', town: 'Huddersfield', postcode: 'HD1 2SL', notes: 'Landlord with several rental properties. Invoice to office, tenant contact on each job.' },
];

/** customer index into demoCustomers, days ago, source, description */
export const demoEnquiries: { customer: number; daysAgo: number; source: 'phone' | 'website' | 'referral' | 'walk-in' | 'other'; description: string }[] = [
  { customer: 0, daysAgo: 52, source: 'phone', description: 'Re-plaster back bedroom after removing old wallpaper. Plaster is blown in places. About 4m x 3m.' },
  { customer: 1, daysAgo: 47, source: 'referral', description: 'Kitchen extension needs skimming throughout plus coving in the dining room.' },
  { customer: 2, daysAgo: 41, source: 'website', description: 'Cracked lath and plaster ceiling in the front room. Wants it overboarded and skimmed. Original cornice to keep.' },
  { customer: 3, daysAgo: 36, source: 'phone', description: 'Rotten lintel over the back door, bricks cracking above. Needs replacing and making good.' },
  { customer: 4, daysAgo: 30, source: 'website', description: 'Artex ceilings in the hallway and landing — wants them covered and smooth.' },
  { customer: 5, daysAgo: 26, source: 'phone', description: 'Render the gable end of the house, about 40m². Old render is cracked and coming away.' },
  { customer: 6, daysAgo: 21, source: 'walk-in', description: 'Small patch repair in the living room where a radiator was moved. Two patches.' },
  { customer: 7, daysAgo: 16, source: 'website', description: 'New stud wall to split a large bedroom into two, with a doorway. Room is about 5m wide.' },
  { customer: 8, daysAgo: 11, source: 'referral', description: 'Skim the whole downstairs of a new-build that has poor finishes — lounge, dining and hall.' },
  { customer: 9, daysAgo: 7, source: 'phone', description: 'Take out the chimney breast in the dining room and plaster the wall.' },
  { customer: 10, daysAgo: 3, source: 'website', description: 'Bathroom walls need re-plastering before new tiles go on. Small room, about 2m x 2.5m.' },
  { customer: 11, daysAgo: 1, source: 'phone', description: 'Rental property between tenants: patch repairs in three rooms and skim the kitchen ceiling. Needs doing within two weeks.' },
];

export const demoTemplates = [
  {
    key: 'quote_sent',
    label: 'Quote sent',
    channel: 'email',
    subject: 'Your quote from {{business_name}} ({{ref}})',
    body: 'Hi {{customer_first_name}},\n\nThanks for getting in touch. Here’s your quote for {{title}}: {{amount}} including VAT.\n\nYou can view it, ask a question or accept it here:\n{{link}}\n\nAny questions, just reply or give me a ring on {{business_phone}}.\n\nThanks,\n{{owner_name}}\n{{business_name}}',
  },
  {
    key: 'quote_reminder',
    label: 'Quote reminder (nudge)',
    channel: 'email',
    subject: 'Just checking in about your quote ({{ref}})',
    body: 'Hi {{customer_first_name}},\n\nJust checking you received the quote I sent for {{title}}. Happy to answer any questions or pop round to talk it through.\n\nYou can view it here:\n{{link}}\n\nThanks,\n{{owner_name}}',
  },
  {
    key: 'quote_accepted_owner',
    label: 'Quote accepted (to you)',
    channel: 'email',
    subject: '{{customer_name}} accepted {{ref}}',
    body: 'Good news — {{customer_name}} accepted quote {{ref}} for {{amount}}. It’s now on your job board ready to book in.',
  },
  {
    key: 'variation_approval',
    label: 'Extra work approval',
    channel: 'email',
    subject: 'Extra work on your job: please approve',
    body: 'Hi {{customer_first_name}},\n\nWhile working on your job we found something that needs sorting:\n\n{{variation_description}} — {{amount}} including VAT.\n\nPlease have a look and approve it here before we go ahead:\n{{link}}\n\nThanks,\n{{owner_name}}',
  },
  {
    key: 'signoff_copy',
    label: 'Job signed off (copy for customer)',
    channel: 'email',
    subject: 'Your job is finished: thank you',
    body: 'Hi {{customer_first_name}},\n\nThanks for signing off the work at {{address}}. You can see a copy here:\n{{link}}\n\nYour invoice will follow shortly.\n\nThanks,\n{{owner_name}}',
  },
  {
    key: 'invoice_sent',
    label: 'Invoice sent',
    channel: 'email',
    subject: 'Invoice {{ref}} from {{business_name}}',
    body: 'Hi {{customer_first_name}},\n\nThanks for choosing us. Your invoice for {{amount}} is ready, due by {{due_date}}.\n\nView and pay it here:\n{{link}}\n\nPlease use the reference {{payment_reference}} if paying by bank transfer.\n\nThanks,\n{{owner_name}}',
  },
  {
    key: 'reminder_before_3',
    label: 'Reminder: 3 days before due',
    channel: 'email',
    subject: 'Friendly reminder: invoice {{ref}} due {{due_date}}',
    body: 'Hi {{customer_first_name}},\n\nJust a friendly reminder that invoice {{ref}} for {{amount}} is due on {{due_date}}.\n\n{{link}}\n\nIf you’ve already paid, thank you, and please ignore this.\n\n{{owner_name}}',
  },
  {
    key: 'reminder_due',
    label: 'Reminder: due today',
    channel: 'email',
    subject: 'Invoice {{ref}} is due today',
    body: 'Hi {{customer_first_name}},\n\nInvoice {{ref}} for {{amount}} is due today. You can view and pay it here:\n{{link}}\n\nIf you’ve already paid, thank you. It may take a day to show on our side.\n\n{{owner_name}}',
  },
  {
    key: 'reminder_overdue_7',
    label: 'Reminder: 7 days overdue',
    channel: 'email',
    subject: 'Invoice {{ref}}: a quick reminder',
    body: 'Hi {{customer_first_name}},\n\nI hope all’s well. Our records show invoice {{ref}} for {{amount}} was due on {{due_date}} and is still open.\n\n{{link}}\n\nIf there’s a problem with the work or the invoice, just let me know and we’ll sort it out.\n\nThanks,\n{{owner_name}}',
  },
  {
    key: 'reminder_overdue_14',
    label: 'Reminder: 14 days overdue',
    channel: 'email',
    subject: 'Invoice {{ref}} is now two weeks overdue',
    body: 'Hi {{customer_first_name}},\n\nInvoice {{ref}} for {{amount}} is now two weeks past its due date of {{due_date}}. Could you let me know when you’re able to pay, or give me a ring on {{business_phone}} if you’d like to talk it through?\n\n{{link}}\n\nThanks very much,\n{{owner_name}}',
  },
];
