import { useEffect, useState } from 'react';
import { formatAgo, formatDateTime } from '../../shared/format';
import { api, errorMessage } from '../api';
import { Icon } from '../components/Icon';
import { Banner, EmptyState, PageHeader, Pill, Spinner } from '../components/ui';
import type { OutboxMessage } from '../types';

/** Every email and text the app would have sent, so you can show exactly what customers get. */
export function OutboxPage() {
  const [messages, setMessages] = useState<OutboxMessage[] | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<OutboxMessage[]>('/api/outbox')
      .then((rows) => {
        setMessages(rows);
        setOpenId(rows[0]?.id ?? null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <>
      <PageHeader title="Outbox" subtitle="Demo: nothing is really sent. This is exactly what your customers would receive." />
      {error && <Banner>{error}</Banner>}
      {!messages && !error && <Spinner />}
      {messages && messages.length === 0 && (
        <div className="card">
          <EmptyState icon="inbox" title="Nothing sent yet">
            When you send a quote or a reminder, the email or text appears here.
          </EmptyState>
        </div>
      )}
      {messages && messages.length > 0 && (
        <ul className="list card outbox">
          {messages.map((m) => {
            const open = openId === m.id;
            const toOwner = m.template_key === 'owner_alert' || m.template_key === 'quote_accepted_owner';
            return (
              <li key={m.id}>
                <button className="list-row" onClick={() => setOpenId(open ? null : m.id)} aria-expanded={open}>
                  <span className={`outbox-icon ${m.channel}`}>
                    <Icon name={m.channel === 'sms' ? 'message' : 'mail'} size={18} />
                  </span>
                  <div className="grow">
                    <div className="title">
                      {m.subject || m.body.split('\n')[0]}
                    </div>
                    <div className="meta">
                      To {m.to_name} · {m.to_address}
                    </div>
                  </div>
                  <div className="end">
                    <div className="tiny muted nowrap">{formatAgo(m.created_at)}</div>
                    {toOwner ? <Pill>To you</Pill> : <Pill kind="info">{m.channel === 'sms' ? 'Text' : 'Email'}</Pill>}
                  </div>
                </button>
                {open && (
                  <div className="outbox-body">
                    <div className="email-preview">
                      <dl className="email-head">
                        <dt>To</dt>
                        <dd>
                          {m.to_name} &lt;{m.to_address}&gt;
                        </dd>
                        {m.subject && (
                          <>
                            <dt>Subject</dt>
                            <dd className="strong">{m.subject}</dd>
                          </>
                        )}
                        <dt>Sent</dt>
                        <dd>{formatDateTime(m.created_at)} (simulated)</dd>
                      </dl>
                      <p className="pre-line email-text">{m.body}</p>
                      {m.links.length > 0 && (
                        <div className="email-links">
                          {m.links.map((l) => (
                            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                              {l.label} <Icon name="chevronRight" size={16} />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
