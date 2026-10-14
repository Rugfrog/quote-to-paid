import type { QuoteStatus } from '../types';
import { Pill } from './ui';

const QUOTE_STATUS: Record<QuoteStatus, { label: string; kind?: 'brand' | 'ok' | 'warn' | 'danger' | 'info' }> = {
  draft: { label: 'Draft' },
  sent: { label: 'Sent', kind: 'info' },
  viewed: { label: 'Viewed', kind: 'brand' },
  accepted: { label: 'Accepted', kind: 'ok' },
  declined: { label: 'Declined', kind: 'danger' },
  expired: { label: 'Expired', kind: 'warn' },
};

export function QuoteStatusPill({ status }: { status: QuoteStatus }) {
  const s = QUOTE_STATUS[status];
  return <Pill kind={s.kind}>{s.label}</Pill>;
}

export const quoteStatusLabel = (status: QuoteStatus) => QUOTE_STATUS[status].label;
