import { EmptyState, PageHeader } from '../components/ui';
import type { IconName } from '../components/Icon';

const areas: Record<string, { title: string; icon: IconName; text: string }> = {
  quotes: {
    title: 'Quotes',
    icon: 'quote',
    text: 'The quote builder is next: priced from your own price list, sent as a link your customer can accept on their phone.',
  },
  jobs: {
    title: 'Jobs',
    icon: 'jobs',
    text: 'Accepted quotes will turn into jobs here, with a board for booking, photos, checklists and customer sign-off.',
  },
  money: {
    title: 'Money',
    icon: 'money',
    text: 'Invoices, payments and polite automatic reminders will live here.',
  },
  outbox: {
    title: 'Outbox',
    icon: 'inbox',
    text: 'Every email and text the app would send to customers will appear here, so you can see exactly what they get.',
  },
};

/** Placeholder for areas built in later stages. */
export function ComingSoonPage({ area }: { area: keyof typeof areas }) {
  const a = areas[area];
  return (
    <>
      <PageHeader title={a.title} />
      <div className="coming-soon">
        <EmptyState icon={a.icon} title="Coming in the next build stage">
          {a.text}
        </EmptyState>
      </div>
    </>
  );
}
