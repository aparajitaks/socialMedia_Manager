'use client';

import { useState, useMemo } from 'react';
import {
  Post,
  SocialAccount,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  Platform,
} from '@/lib/api';
import PlatformLogo from './PlatformLogo';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return (d + 6) % 7; // Mon-first
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface Props {
  posts: Post[];
  accounts: SocialAccount[];
  openComposer: (date?: string) => void;
  onSelectPost: (post: Post) => void;
}

function StatusBadge({ status }: { status: Post['status'] }) {
  const map: Record<string, string> = {
    draft: '#9A9A93',
    scheduled: '#2B6E63',
    publishing: '#2B6E63',
    published: '#2B6E63',
    failed: '#B34A3C',
  };
  return (
    <span className="text-xs font-medium" style={{ color: map[status] ?? '#9A9A93' }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function CalendarView({ posts, accounts, openComposer, onSelectPost }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [expanded, setExpanded] = useState<string | null>(null);

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const daysInMonth = getDaysInMonth(year, month);
  const startOffset = getFirstDayOfWeek(year, month);

  // Build day → posts map
  const byDay = useMemo(() => {
    const map: Record<string, Post[]> = {};
    for (const post of posts) {
      const dateStr = post.scheduled_at || post.published_at || post.created_at;
      if (!dateStr) continue;
      const d = new Date(dateStr);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const k = dateKey(year, month, d.getDate());
        if (!map[k]) map[k] = [];
        map[k].push(post);
      }
    }
    return map;
  }, [posts, year, month]);

  const prev = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
    setExpanded(null);
  };
  const next = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
    setExpanded(null);
  };

  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // All platforms that actually have accounts connected
  const platformsInUse = useMemo(() => {
    const s = new Set<Platform>(accounts.map((a) => a.platform));
    return Array.from(s);
  }, [accounts]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b shrink-0"
        style={{ borderColor: '#D8DAD5' }}
      >
        <div className="flex items-center gap-3">
          <button
            id="cal-prev-btn"
            onClick={prev}
            className="px-2 py-1 text-sm border rounded transition-colors hover:bg-white"
            style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
          >
            ←
          </button>
          <h1 className="text-base font-semibold" style={{ color: '#1C2321' }}>
            {MONTHS[month]} {year}
          </h1>
          <button
            id="cal-next-btn"
            onClick={next}
            className="px-2 py-1 text-sm border rounded transition-colors hover:bg-white"
            style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
          >
            →
          </button>
        </div>

        {/* Platform legend */}
        <div className="flex items-center gap-3">
          {platformsInUse.map((p) => (
            <span key={p} className="flex items-center gap-1.5 text-xs" style={{ color: '#9A9A93' }}>
              <PlatformLogo platform={p} size={14} />
              {PLATFORM_LABELS[p]}
            </span>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto">
        {/* Day headers */}
        <div
          className="grid border-b"
          style={{ gridTemplateColumns: 'repeat(7, 1fr)', borderColor: '#D8DAD5' }}
        >
          {DAYS.map((d) => (
            <div
              key={d}
              className="px-3 py-2 text-xs font-medium border-r last:border-r-0"
              style={{ color: '#9A9A93', borderColor: '#D8DAD5' }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, i) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${i}`}
                  className="border-r border-b"
                  style={{ minHeight: 96, borderColor: '#D8DAD5', background: '#F4F5F2', opacity: 0.4 }}
                />
              );
            }

            const k = dateKey(year, month, day);
            const dayPosts = byDay[k] || [];
            const isToday = k === todayKey;
            const isExpanded = expanded === k;

            return (
              <div
                key={k}
                className="border-r border-b last:border-r-0 cursor-pointer transition-colors"
                style={{
                  minHeight: 96,
                  borderColor: '#D8DAD5',
                  background: isExpanded ? '#FAFAF8' : 'transparent',
                }}
                onClick={() => setExpanded(isExpanded ? null : k)}
              >
                <div className="p-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full"
                      style={{
                        color: isToday ? '#fff' : '#1C2321',
                        background: isToday ? '#2B6E63' : 'transparent',
                      }}
                    >
                      {day}
                    </span>
                    {dayPosts.length > 0 && !isExpanded && (
                      <span className="text-xs" style={{ color: '#9A9A93' }}>
                        {dayPosts.length}
                      </span>
                    )}
                  </div>

                  {/* Chips (collapsed) */}
                  {!isExpanded &&
                    dayPosts.slice(0, 4).map((post) => {
                      const acc = accountMap.get(post.social_account_id);
                      const color = PLATFORM_COLORS[post.platform] ?? '#9A9A93';
                      return (
                        <div
                          key={post.id}
                          className="flex items-center gap-1 mb-0.5 rounded-sm px-1 py-0.5"
                          style={{ background: color + '18' }}
                          onClick={(e) => { e.stopPropagation(); onSelectPost(post); }}
                        >
                          <PlatformLogo platform={post.platform} size={12} />
                          <span className="text-xs truncate" style={{ color: '#1C2321', fontSize: 11 }}>
                            {acc?.display_name.split(' ')[0] ?? post.platform}
                          </span>
                        </div>
                      );
                    })}
                  {!isExpanded && dayPosts.length > 4 && (
                    <span style={{ color: '#9A9A93', fontSize: 11 }} className="text-xs">
                      +{dayPosts.length - 4} more
                    </span>
                  )}

                  {/* Expanded list */}
                  {isExpanded && (
                    <div className="mt-1 space-y-1.5">
                      {dayPosts.length === 0 && (
                        <p className="text-xs" style={{ color: '#9A9A93' }}>No posts scheduled.</p>
                      )}
                      {dayPosts.map((post) => {
                        const acc = accountMap.get(post.social_account_id);
                        const color = PLATFORM_COLORS[post.platform] ?? '#9A9A93';
                        const dateStr = post.scheduled_at || post.published_at || post.created_at;
                        return (
                          <div
                            key={post.id}
                            className="border rounded p-2 text-xs cursor-pointer"
                            style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}
                            onClick={(e) => { e.stopPropagation(); onSelectPost(post); }}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <PlatformLogo platform={post.platform} size={16} />
                              <span className="font-medium" style={{ color: '#1C2321' }}>
                                {acc?.display_name ?? post.platform}
                              </span>
                              <span className="ml-auto" style={{ color: '#9A9A93' }}>
                                {fmt(dateStr!)}
                              </span>
                            </div>
                            <p className="leading-snug line-clamp-2" style={{ color: '#1C2321' }}>
                              {post.content}
                            </p>
                            <div className="mt-1">
                              <StatusBadge status={post.status} />
                            </div>
                          </div>
                        );
                      })}
                      <button
                        className="w-full text-xs py-1 border rounded text-center transition-colors hover:bg-white mt-1"
                        style={{ borderColor: '#D8DAD5', color: '#2B6E63' }}
                        onClick={(e) => { e.stopPropagation(); openComposer(k); }}
                      >
                        + Add post
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
