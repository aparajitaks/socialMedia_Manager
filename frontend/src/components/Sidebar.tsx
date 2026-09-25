'use client';

import { PLATFORM_COLORS, PLATFORM_LABELS, type Platform } from '@/lib/api';

type NavSection = 'calendar' | 'status' | 'analytics' | 'accounts';

interface Props {
  section: NavSection;
  setSection: (s: NavSection) => void;
  openComposer: () => void;
  role: 'admin' | 'editor';
  setRole: (r: 'admin' | 'editor') => void;
  onRunScheduler: () => void;
  schedulerRunning: boolean;
}

const NAV: { id: NavSection; label: string }[] = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'status', label: 'Status' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'accounts', label: 'Accounts' },
];

export default function Sidebar({
  section,
  setSection,
  openComposer,
  role,
  setRole,
  onRunScheduler,
  schedulerRunning,
}: Props) {
  return (
    <aside
      className="flex flex-col w-48 shrink-0 border-r"
      style={{ background: '#F4F5F2', borderColor: '#D8DAD5' }}
    >
      {/* Wordmark */}
      <div className="px-5 py-5 border-b" style={{ borderColor: '#D8DAD5' }}>
        <span className="font-semibold text-sm tracking-tight" style={{ color: '#1C2321' }}>
          Postline
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3">
        {NAV.map(({ id, label }) => {
          const active = section === id;
          return (
            <button
              key={id}
              id={`sidebar-nav-${id}`}
              onClick={() => setSection(id)}
              className="w-full text-left px-5 py-2 text-sm transition-colors"
              style={{
                color: active ? '#2B6E63' : '#1C2321',
                background: active ? '#EBF3F1' : 'transparent',
                fontWeight: active ? 500 : 400,
              }}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {/* Compose button */}
      <div className="px-4 pb-3">
        <button
          id="sidebar-new-post-btn"
          onClick={openComposer}
          className="w-full py-2 px-3 text-sm font-medium rounded text-center transition-opacity hover:opacity-90 active:opacity-80"
          style={{ background: '#2B6E63', color: '#fff' }}
        >
          New post
        </button>
      </div>

      {/* Scheduler ticker */}
      <div
        className="mx-4 mb-3 px-3 py-2 border rounded text-xs flex flex-col gap-1"
        style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}
      >
        <div className="flex items-center justify-between">
          <span style={{ color: '#9A9A93' }}>Scheduler</span>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#2B6E63' }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: '#1C2321' }}>
            Server-side ✓
          </span>
          <button
            id="sidebar-run-scheduler-btn"
            onClick={onRunScheduler}
            disabled={schedulerRunning}
            className="text-xs px-2 py-0.5 rounded transition-colors hover:bg-white"
            style={{
              borderColor: '#D8DAD5',
              border: '1px solid #D8DAD5',
              color: '#2B6E63',
              opacity: schedulerRunning ? 0.5 : 1,
            }}
          >
            {schedulerRunning ? '…' : 'Run now'}
          </button>
        </div>
      </div>

      {/* Role switcher */}
      <div
        className="mx-4 mb-3 border rounded overflow-hidden flex"
        style={{ borderColor: '#D8DAD5' }}
      >
        <button
          id="role-btn-admin"
          onClick={() => setRole('admin')}
          className="flex-1 py-1 text-xs transition-colors"
          style={{
            background: role === 'admin' ? '#1C2321' : 'transparent',
            color: role === 'admin' ? '#F4F5F2' : '#9A9A93',
          }}
        >
          Admin
        </button>
        <button
          id="role-btn-editor"
          onClick={() => setRole('editor')}
          className="flex-1 py-1 text-xs border-l transition-colors"
          style={{
            borderColor: '#D8DAD5',
            background: role === 'editor' ? '#1C2321' : 'transparent',
            color: role === 'editor' ? '#F4F5F2' : '#9A9A93',
          }}
        >
          Editor
        </button>
      </div>

      {/* Team */}
      <div className="px-5 py-4 border-t" style={{ borderColor: '#D8DAD5' }}>
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
            style={{ background: '#D8DAD5', color: '#1C2321' }}
          >
            MK
          </div>
          <span className="text-xs" style={{ color: '#9A9A93' }}>
            Marketing team
          </span>
        </div>
      </div>
    </aside>
  );
}
