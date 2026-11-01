import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, LoaderCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  useNotificationConnection,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationSummary,
} from '../hooks/useNotifications';
import type { UserNotification } from '../services/notification-api';

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const query = useNotificationSummary();
  const connected = useNotificationConnection();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const outside = (event: MouseEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('mousedown', outside);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('mousedown', outside);
    };
  }, [open]);

  if (user?.role !== 'CUSTOMER') return null;
  const unread = query.data?.unreadCount ?? 0;
  async function openItem(item: UserNotification) {
    setOpen(false);
    if (!item.readAt) {
      try {
        await markRead(item.id);
      } catch {
        /* The order still opens; the unread state remains accurate. */
      }
    }
    navigate(`/orders/${item.orderId}`);
  }

  return (
    <div className="notification-bell-wrap" ref={root}>
      <button
        className="icon-button"
        aria-label={`Thông báo, ${unread} chưa đọc`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell />
        {unread > 0 ? (
          <span className="action-count">{unread > 99 ? '99+' : unread}</span>
        ) : null}
      </button>
      {open ? (
        <section
          className="notification-popover"
          role="dialog"
          aria-label="Thông báo của bạn"
        >
          <header>
            <div>
              <strong>Thông báo</strong>
              <small>
                {connected ? 'Đang kết nối realtime' : 'Đang kết nối lại'}
              </small>
            </div>
            <button
              disabled={!unread || !query.data}
              onClick={() => void markAll().catch(() => undefined)}
            >
              <CheckCheck size={15} /> Đọc tất cả
            </button>
          </header>
          {query.isPending ? (
            <div className="notification-state">
              <LoaderCircle className="animate-spin" /> Đang tải thông báo…
            </div>
          ) : query.isError ? (
            <div className="notification-state">
              <p>Chưa tải được thông báo.</p>
              <button onClick={() => void query.refetch()}>Thử lại</button>
            </div>
          ) : query.data.items.length ? (
            <ul>
              {query.data.items.map((item) => (
                <li key={item.id}>
                  <button
                    className={
                      item.readAt
                        ? 'notification-item'
                        : 'notification-item unread'
                    }
                    onClick={() => void openItem(item)}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <time dateTime={item.createdAt}>
                      {dateLabel(item.createdAt)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="notification-state">Bạn chưa có thông báo nào.</div>
          )}
          <Link to="/notifications" onClick={() => setOpen(false)}>
            Xem tất cả thông báo
          </Link>
        </section>
      ) : null}
    </div>
  );
}
