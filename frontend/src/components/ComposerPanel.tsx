'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  SocialAccount,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  Platform,
  createPosts,
} from '@/lib/api';
import PlatformLogo from './PlatformLogo';

interface Props {
  accounts: SocialAccount[];
  initialDate: string | null;
  onClose: () => void;
  onCreated: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

const CHAR_LIMITS: Record<Platform, number> = {
  x: 280,
  linkedin: 3000,
  facebook: 63206,
  instagram: 2200,
  google_business: 1500,
};

export default function ComposerPanel({ accounts, initialDate, onClose, onCreated, showToast }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [date, setDate] = useState(
    initialDate ? initialDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [time, setTime] = useState('09:00');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Default: pre-select first account
  useEffect(() => {
    if (accounts.length > 0 && selectedIds.length === 0) {
      setSelectedIds([accounts[0].id]);
    }
  }, [accounts]);

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectedAccounts = accounts.filter((a) => selectedIds.includes(a.id));

  const handleAction = async (type: 'draft' | 'schedule') => {
    if (selectedIds.length === 0) {
      showToast('Select at least one account', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const scheduledAt =
        type === 'schedule'
          ? new Date(`${date}T${time}:00`).toISOString()
          : undefined;

      const payloadAccounts = selectedIds.map((id) => ({
        social_account_id: id,
        content: texts[id] || '',
        media_urls: [],
      }));

      await createPosts({
        label: label || undefined,
        accounts: payloadAccounts,
        scheduled_at: scheduledAt,
      });

      setSaved(true);
      showToast(type === 'draft' ? 'Draft saved!' : 'Post scheduled!');
      setTimeout(() => {
        setSaved(false);
        onClose();
        onCreated();
      }, 1000);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-10"
        style={{ background: 'rgba(28,35,33,0.2)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="absolute right-0 top-0 bottom-0 z-20 flex flex-col border-l overflow-hidden"
        style={{ width: 460, background: '#FAFAF8', borderColor: '#D8DAD5' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: '#D8DAD5' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
            New post
          </h2>
          <button
            id="composer-close-btn"
            onClick={onClose}
            className="text-sm px-2 py-0.5 rounded transition-colors hover:bg-gray-100"
            style={{ color: '#9A9A93' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Campaign label */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#9A9A93' }}>
              Campaign label (optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Q4 product launch"
              id="composer-label-input"
              className="w-full border rounded px-3 py-2 text-sm outline-none"
              style={{ borderColor: '#D8DAD5', background: '#fff', color: '#1C2321' }}
              onFocus={(e) => (e.target.style.borderColor = '#2B6E63')}
              onBlur={(e) => (e.target.style.borderColor = '#D8DAD5')}
            />
          </div>

          {/* Account selection */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: '#9A9A93' }}>
              Accounts
            </label>
            {accounts.length === 0 ? (
              <p className="text-xs" style={{ color: '#9A9A93' }}>
                No accounts connected. Go to Accounts to connect one.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {accounts.map((acc) => {
                  const active = selectedIds.includes(acc.id);
                  const color = PLATFORM_COLORS[acc.platform];
                  return (
                    <button
                      key={acc.id}
                      onClick={() => toggle(acc.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 border rounded text-xs transition-colors"
                      style={{
                        borderColor: active ? color : '#D8DAD5',
                        background: active ? color + '12' : 'transparent',
                        color: active ? '#1C2321' : '#9A9A93',
                      }}
                    >
                      <PlatformLogo platform={acc.platform} size={15} />
                      {acc.display_name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Per-account text fields */}
          {selectedAccounts.length === 0 && (
            <p className="text-xs" style={{ color: '#9A9A93' }}>
              Select at least one account above.
            </p>
          )}
          {selectedAccounts.map((acc) => {
            const limit = CHAR_LIMITS[acc.platform] ?? 3000;
            const text = texts[acc.id] || '';
            const remaining = limit - text.length;
            return (
              <div key={acc.id}>
                <label
                  className="flex items-center gap-2 text-xs font-medium mb-1.5"
                  style={{ color: '#1C2321' }}
                >
                  <PlatformLogo platform={acc.platform} size={16} />
                  {PLATFORM_LABELS[acc.platform]} — {acc.display_name}
                </label>
                <textarea
                  id={`composer-text-${acc.id}`}
                  value={text}
                  onChange={(e) => setTexts((prev) => ({ ...prev, [acc.id]: e.target.value }))}
                  rows={4}
                  placeholder={`Write your ${PLATFORM_LABELS[acc.platform]} caption…`}
                  className="w-full border rounded px-3 py-2 text-sm resize-none outline-none transition-colors"
                  style={{
                    borderColor: '#D8DAD5',
                    background: '#fff',
                    color: '#1C2321',
                    lineHeight: 1.6,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#2B6E63')}
                  onBlur={(e) => (e.target.style.borderColor = '#D8DAD5')}
                />
                <div className="flex justify-between mt-0.5">
                  <span />
                  <span
                    className="text-xs"
                    style={{ color: remaining < 0 ? '#B34A3C' : '#9A9A93' }}
                  >
                    {remaining} / {limit}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Media upload placeholder */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#9A9A93' }}>
              Media
            </label>
            <div
              className="border-2 border-dashed rounded px-4 py-6 text-center text-xs cursor-pointer transition-colors hover:border-gray-400"
              style={{ borderColor: '#D8DAD5', color: '#9A9A93' }}
            >
              Drop image or video here, or{' '}
              <span style={{ color: '#2B6E63' }}>browse</span>
              <div className="mt-1" style={{ color: '#9A9A93' }}>
                JPG, PNG, MP4 — max 100 MB
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#9A9A93' }}>
              Scheduled for
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                id="composer-date-input"
                className="border rounded px-3 py-2 text-sm outline-none flex-1"
                style={{ borderColor: '#D8DAD5', background: '#fff', color: '#1C2321' }}
              />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                id="composer-time-input"
                className="border rounded px-3 py-2 text-sm outline-none w-28"
                style={{ borderColor: '#D8DAD5', background: '#fff', color: '#1C2321' }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-2 px-5 py-4 border-t shrink-0"
          style={{ borderColor: '#D8DAD5' }}
        >
          {saved ? (
            <span className="text-sm font-medium" style={{ color: '#2B6E63' }}>
              Saved ✓
            </span>
          ) : (
            <>
              <button
                id="composer-draft-btn"
                onClick={() => handleAction('draft')}
                disabled={submitting || selectedIds.length === 0}
                className="px-4 py-2 text-sm border rounded transition-colors hover:bg-white"
                style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
              >
                Save as draft
              </button>
              <button
                id="composer-schedule-btn"
                onClick={() => handleAction('schedule')}
                disabled={submitting || selectedIds.length === 0}
                className="px-4 py-2 text-sm font-medium rounded transition-opacity hover:opacity-90"
                style={{
                  background: '#2B6E63',
                  color: '#fff',
                  opacity: selectedIds.length === 0 ? 0.4 : 1,
                }}
              >
                {submitting ? 'Scheduling…' : 'Schedule'}
              </button>
            </>
          )}
          <span className="ml-auto text-xs" style={{ color: '#9A9A93' }}>
            Esc to close
          </span>
        </div>
      </div>
    </>
  );
}
