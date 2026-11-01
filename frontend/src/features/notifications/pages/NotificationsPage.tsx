import { useState } from 'react';
import { Bell, CheckCheck, LoaderCircle } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationConnection,
} from '../hooks/useNotifications';
import { getNotifications } from '../services/notification-api';
import { useQuery } from '@tanstack/react-query';
import { notificationKeys } from '../hooks/useNotifications';

export function NotificationsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const navigate = useNavigate();
  const connected = useNotificationConnection();
  const query = useQuery({
    queryKey: notificationKeys.list(user?.id, page, unreadOnly, 20),
    queryFn: () => getNotifications({ page, pageSize: 20, unreadOnly }),
    enabled: user?.role === 'CUSTOMER',
    refetchOnWindowFocus: true,
    retry: false,
  });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  if (user?.role !== 'CUSTOMER') return <Navigate to="/" replace />;
  async function openOrder(id: string, orderId: string, readAt: string | null) {
    if (!readAt) {
      try {
        await markRead(id);
      } catch {
        /* Keep the displayed unread state when the request fails. */
      }
    }
    navigate(`/orders/${orderId}`);
  }
  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / 20));
  return (
    <main className="notification-page page-container page-section">
      <div className="notification-page-heading">
        <div>
          <span className="section-eyebrow">TÀI KHOẢN CỦA BẠN</span>
          <h1>Thông báo</h1>
          <p>
            {connected
              ? 'Thông báo được cập nhật theo thời gian thực.'
              : 'Đang khôi phục kết nối thông báo.'}
          </p>
        </div>
        <button
          disabled={!query.data?.unreadCount}
          onClick={() => void markAll().catch(() => undefined)}
        >
          <CheckCheck size={17} /> Đánh dấu tất cả đã đọc
        </button>
      </div>
      <div className="notification-filters">
        <button
          className={!unreadOnly ? 'active' : ''}
          onClick={() => {
            setUnreadOnly(false);
            setPage(1);
          }}
        >
          Tất cả
        </button>
        <button
          className={unreadOnly ? 'active' : ''}
          onClick={() => {
            setUnreadOnly(true);
            setPage(1);
          }}
        >
          Chưa đọc
        </button>
        <span>{query.data?.unreadCount ?? 0} chưa đọc</span>
      </div>
      {query.isPending ? (
        <div className="notification-page-state">
          <LoaderCircle className="animate-spin" /> Đang tải…
        </div>
      ) : query.isError ? (
        <div className="notification-page-state">
          <p>Chưa tải được thông báo.</p>
          <button onClick={() => void query.refetch()}>Thử lại</button>
        </div>
      ) : query.data.items.length ? (
        <>
          <ul className="notification-list">
            {query.data.items.map((item) => (
              <li key={item.id}>
                <button
                  className={
                    item.readAt
                      ? 'notification-page-item'
                      : 'notification-page-item unread'
                  }
                  onClick={() =>
                    void openOrder(item.id, item.orderId, item.readAt)
                  }
                >
                  <span className="notification-page-icon">
                    <Bell size={18} />
                  </span>
                  <span className="notification-page-copy">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <time dateTime={item.createdAt}>
                      {new Intl.DateTimeFormat('vi-VN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: 'Asia/Ho_Chi_Minh',
                      }).format(new Date(item.createdAt))}
                    </time>
                  </span>
                  <span className="notification-order-link">
                    Đơn #{item.orderId}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <nav
            className="notification-pagination"
            aria-label="Phân trang thông báo"
          >
            <button
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Trước
            </button>
            <span>
              Trang {page} / {pageCount}
            </span>
            <button
              disabled={page >= pageCount}
              onClick={() => setPage((value) => value + 1)}
            >
              Sau
            </button>
          </nav>
        </>
      ) : (
        <div className="notification-page-state">
          <Bell size={24} />
          <p>Chưa có thông báo nào.</p>
          <Link to="/orders">Xem đơn hàng</Link>
        </div>
      )}
    </main>
  );
}
