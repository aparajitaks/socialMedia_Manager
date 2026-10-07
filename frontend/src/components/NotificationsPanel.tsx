'use client';

import { useState, useEffect } from 'react';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  entity_id?: string;
  entity_type?: string;
}

interface Props {
  onClose: () => void;
}

export default function NotificationsPanel({ onClose }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data) ? data : data.notifications || []);
      }
    } catch (e) {
      console.error('Failed to load notifications', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const markRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {}
  };

  const TYPE_ICONS: Record<string, string> = {
    POST_APPROVED: '✓',
    POST_REJECTED: '✕',
    APPROVAL_REQUESTED: '⏳',
    POST_PUBLISHED: '📢',
    TOKEN_EXPIRING: '⚠️',
    default: '🔔',
  };

  const TYPE_COLORS: Record<string, string> = {
    POST_APPROVED: '#2B6E63',
    POST_REJECTED: '#B34A3C',
    APPROVAL_REQUESTED: '#C07B3A',
    POST_PUBLISHED: '#2B6E63',
    TOKEN_EXPIRING: '#B34A3C',
    default: '#9A9A93',
  };

  const unread = notifications.filter((n) => !n.is_read).length;

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed right-4 top-12 z-50 w-80 border rounded shadow-lg overflow-hidden flex flex-col"
        style={{ background: '#FAFAF8', borderColor: '#D8DAD5', maxHeight: '70vh' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: '#D8DAD5' }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: '#1C2321' }}>Notifications</span>
            {unread > 0 && (
              <span className="px-1.5 py-0.5 text-xs rounded-full font-medium" style={{ background: '#B34A3C', color: '#fff' }}>
                {unread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs transition-colors hover:underline"
                style={{ color: '#2B6E63' }}
              >
                Mark all read
              </button>
            )}
            <button onClick={onClose} className="text-xs" style={{ color: '#9A9A93' }}>✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-4 text-xs text-center" style={{ color: '#9A9A93' }}>Loading…</div>
          )}
          {!loading && notifications.length === 0 && (
            <div className="p-6 text-xs text-center" style={{ color: '#9A9A93' }}>
              <div className="text-2xl mb-2">🔔</div>
              No notifications yet
            </div>
          )}
          {notifications.map((n) => {
            const icon = TYPE_ICONS[n.type] || TYPE_ICONS.default;
            const color = TYPE_COLORS[n.type] || TYPE_COLORS.default;
            return (
              <div
                key={n.id}
                onClick={() => { if (!n.is_read) markRead(n.id); }}
                className="flex gap-3 px-4 py-3 border-b cursor-pointer transition-colors hover:bg-white"
                style={{
                  borderColor: '#D8DAD5',
                  background: n.is_read ? 'transparent' : '#EBF3F1',
                  opacity: n.is_read ? 0.7 : 1,
                }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5"
                  style={{ background: color + '20', color }}
                >
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium" style={{ color: '#1C2321' }}>{n.title}</div>
                  <div className="text-xs mt-0.5 line-clamp-2" style={{ color: '#9A9A93' }}>{n.message}</div>
                  <div className="text-xs mt-1" style={{ color: '#9A9A93' }}>{timeAgo(n.created_at)}</div>
                </div>
                {!n.is_read && (
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: '#2B6E63' }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
