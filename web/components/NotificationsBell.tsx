import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatAgo } from '../../shared/format';
import { api } from '../api';
import type { Notification } from '../types';
import { Icon } from './Icon';
import { EmptyState, Sheet } from './ui';

/** Bell with an unread count. Checks every 30 seconds so "Susan accepted" shows up quickly. */
export function NotificationsBell({ className = 'btn btn-ghost btn-icon', label = false }: { className?: string; label?: boolean }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api
      .get<{ items: Notification[]; unread: number }>('/api/notifications')
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  function show() {
    setOpen(true);
    if (unread) {
      setUnread(0);
      api.post('/api/notifications/read').catch(() => {});
    }
  }

  return (
    <>
      <button className={className} onClick={show} aria-label={unread ? `Notifications: ${unread} new` : 'Notifications'}>
        <span className="bell">
          <Icon name="bell" />
          {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
        </span>
        {label && 'Notifications'}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Notifications">
        {items.length === 0 ? (
          <EmptyState icon="bell" title="Nothing yet">
            You’ll see it here when a customer opens, accepts or asks about a quote.
          </EmptyState>
        ) : (
          <ul className="list card">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  className="list-row"
                  onClick={() => {
                    setOpen(false);
                    if (n.link) navigate(n.link);
                  }}
                >
                  <span className={`notif-dot ${n.type}`} aria-hidden="true" />
                  <div className="grow">
                    <div className="title" style={{ whiteSpace: 'normal' }}>
                      {n.title}
                    </div>
                    {n.body && <div className="meta" style={{ whiteSpace: 'normal' }}>{n.body}</div>}
                  </div>
                  <span className="tiny muted nowrap">{formatAgo(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
