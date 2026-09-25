'use client';

import { useState, useMemo } from 'react';
import {
  Post,
  SocialAccount,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  retryPost,
  approvePost,
} from '@/lib/api';

type FilterStatus = Post['status'] | 'all';

function fmt(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  draft:      { color: '#9A9A93', label: 'Draft' },
  scheduled:  { color: '#2B6E63', label: 'Scheduled' },
  publishing: { color: '#2B6E63', label: 'Publishing…' },
  published:  { color: '#2B6E63', label: 'Published' },
  failed:     { color: '#B34A3C', label: 'Failed' },
};

interface Props {
  posts: Post[];
  accounts: SocialAccount[];
  role: 'admin' | 'editor';
  onPostUpdated: () => void;
  onSelectPost: (post: Post) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function StatusView({ posts, accounts, role, onPostUpdated, onSelectPost, showToast }: Props) {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [actionId, setActionId] = useState<string | null>(null);

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const allStatuses: FilterStatus[] = ['all', 'scheduled', 'published', 'draft', 'failed'];

  const counts = useMemo((): Record<FilterStatus, number> => ({
    all:        posts.length,
    draft:      posts.filter((p) => p.status === 'draft').length,
    scheduled:  posts.filter((p) => p.status === 'scheduled').length,
    publishing: posts.filter((p) => p.status === 'publishing').length,
    published:  posts.filter((p) => p.status === 'published').length,
    failed:     posts.filter((p) => p.status === 'failed').length,
  }), [posts]);

  const visible = useMemo(
    () =>
      posts
        .filter((p) => filter === 'all' || p.status === filter)
        .sort((a, b) => {
          const ta = a.scheduled_at || a.created_at;
          const tb = b.scheduled_at || b.created_at;
          return new Date(tb).getTime() - new Date(ta).getTime();
        }),
    [posts, filter]
  );

  const handleRetry = async (id: string) => {
    setActionId(id);
    try {
      await retryPost(id);
      showToast('Post reset to scheduled');
      onPostUpdated();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setActionId(null);
    }
  };

  const handleApprove = async (id: string) => {
    setActionId(id);
    try {
      await approvePost(id, role);
      showToast('Post approved');
      onPostUpdated();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-base font-semibold" style={{ color: '#1C2321' }}>
            Post status
          </h1>
          <div className="flex items-center gap-1">
            {allStatuses.map((f) => (
              <button
                key={f}
                id={`status-filter-${f}`}
                onClick={() => setFilter(f)}
                className="px-3 py-1 text-xs rounded transition-colors"
                style={{
                  background: filter === f ? '#1C2321' : 'transparent',
                  color: filter === f ? '#F4F5F2' : '#9A9A93',
                  border: `1px solid ${filter === f ? '#1C2321' : '#D8DAD5'}`,
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                <span className="ml-1" style={{ opacity: 0.6 }}>
                  {counts[f] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="border rounded overflow-hidden" style={{ borderColor: '#D8DAD5' }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: '#F4F5F2', borderBottom: '1px solid #D8DAD5' }}>
                <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: '#9A9A93', width: '40%' }}>
                  Content
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: '#9A9A93' }}>
                  Platform
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: '#9A9A93' }}>
                  Scheduled
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: '#9A9A93' }}>
                  Status
                </th>
                <th className="px-4 py-2.5 text-xs font-medium text-right" style={{ color: '#9A9A93' }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((post, i) => {
                const st = STATUS_STYLES[post.status] ?? STATUS_STYLES.draft;
                const acc = accountMap.get(post.social_account_id);
                const color = PLATFORM_COLORS[post.platform] ?? '#9A9A93';
                const dateStr = post.scheduled_at || post.published_at || post.created_at;
                const isActing = actionId === post.id;

                return (
                  <tr
                    key={post.id}
                    style={{
                      borderBottom: '1px solid #D8DAD5',
                      background: i % 2 === 0 ? '#FAFAF8' : '#F4F5F2',
                      cursor: 'pointer',
                    }}
                    onClick={() => onSelectPost(post)}
                  >
                    {/* Content */}
                    <td className="px-4 py-3" style={{ maxWidth: 0 }}>
                      <p
                        className="text-xs leading-snug truncate"
                        style={{ color: '#1C2321' }}
                        title={post.content}
                      >
                        {post.content}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#9A9A93' }}>
                        {acc?.display_name ?? post.social_account_id}
                      </p>
                      {post.status === 'failed' && post.error_reason && (
                        <p className="text-xs mt-0.5" style={{ color: '#B34A3C' }}>
                          {post.error_reason}
                        </p>
                      )}
                    </td>

                    {/* Platform */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: '#1C2321' }}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        {PLATFORM_LABELS[post.platform]}
                      </span>
                    </td>

                    {/* Time */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: '#9A9A93' }}>
                      {dateStr ? fmt(dateStr) : '—'}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: st.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />
                        {st.label}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {post.status === 'failed' && (
                        <button
                          id={`retry-btn-${post.id}`}
                          onClick={() => handleRetry(post.id)}
                          disabled={isActing}
                          className="text-xs px-2.5 py-1 border rounded transition-colors hover:bg-white mr-1"
                          style={{ borderColor: '#B34A3C', color: '#B34A3C' }}
                        >
                          {isActing ? '…' : 'Retry'}
                        </button>
                      )}
                      {!post.approved_by && post.status !== 'published' && (
                        <button
                          id={`approve-btn-${post.id}`}
                          onClick={() => handleApprove(post.id)}
                          disabled={isActing || role !== 'admin'}
                          className="text-xs px-2.5 py-1 border rounded transition-colors hover:bg-white"
                          style={{
                            borderColor: role === 'admin' ? '#2B6E63' : '#D8DAD5',
                            color: role === 'admin' ? '#2B6E63' : '#9A9A93',
                          }}
                          title={role !== 'admin' ? 'Requires Admin role' : 'Approve post'}
                        >
                          {isActing ? '…' : 'Approve'}
                        </button>
                      )}
                      {post.approved_by && (
                        <span className="text-xs" style={{ color: '#2B6E63' }}>✓ Approved</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs" style={{ color: '#9A9A93' }}>
                    No posts match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs mt-2" style={{ color: '#9A9A93' }}>
          {visible.length} of {posts.length} posts
        </p>
      </div>
    </div>
  );
}
