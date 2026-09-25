'use client';

import React, { useState, useEffect } from 'react';
import {
  Post,
  SocialAccount,
  PostMetric,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  retryPost,
  approvePost,
  patchPost,
  fetchPostMetrics,
} from '@/lib/api';
import PlatformLogo from './PlatformLogo';

interface PostDetailsModalProps {
  post: Post | null;
  accounts: SocialAccount[];
  role: 'admin' | 'editor';
  onClose: () => void;
  onPostUpdated: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export function PostDetailsModal({
  post,
  accounts,
  role,
  onClose,
  onPostUpdated,
  showToast,
}: PostDetailsModalProps) {
  const [metrics, setMetrics] = useState<PostMetric[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedSchedule, setEditedSchedule] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isActing, setIsActing] = useState(false);

  useEffect(() => {
    if (post) {
      setEditedContent(post.content);
      if (post.scheduled_at) {
        const d = new Date(post.scheduled_at);
        const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setEditedSchedule(localIso);
      } else {
        setEditedSchedule('');
      }
      setIsEditing(false);

      if (post.status === 'published') {
        fetchPostMetrics(post.id)
          .then((data) => {
            if (Array.isArray(data)) setMetrics(data);
          })
          .catch((err) => console.error('Failed to load metrics:', err));
      } else {
        setMetrics([]);
      }
    }
  }, [post]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!post) return null;

  const account = accounts.find((a) => a.id === post.social_account_id);
  const canEdit = post.status === 'draft' || post.status === 'scheduled';
  const color = PLATFORM_COLORS[post.platform] ?? '#9A9A93';

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      const payload: { content: string; scheduled_at?: string } = { content: editedContent };
      if (editedSchedule) {
        payload.scheduled_at = new Date(editedSchedule).toISOString();
      }

      await patchPost(post.id, payload);
      showToast('Post updated');
      setIsEditing(false);
      onPostUpdated();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetry = async () => {
    setIsActing(true);
    try {
      await retryPost(post.id);
      showToast('Post reset to scheduled');
      onPostUpdated();
      onClose();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsActing(false);
    }
  };

  const handleApprove = async () => {
    setIsActing(true);
    try {
      await approvePost(post.id, role);
      showToast('Post approved');
      onPostUpdated();
      onClose();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsActing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(28, 35, 33, 0.4)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded border shadow-lg overflow-hidden"
        style={{ background: '#FAFAF8', borderColor: '#D8DAD5' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: '#D8DAD5' }}
        >
          <div className="flex items-center gap-2">
            <PlatformLogo platform={post.platform} size={18} />
            <span className="text-sm font-semibold" style={{ color: '#1C2321' }}>
              {PLATFORM_LABELS[post.platform]}
            </span>
            <span className="text-xs" style={{ color: '#9A9A93' }}>
              · {account?.display_name || post.social_account_id}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded font-medium ml-1"
              style={{
                background:
                  post.status === 'published'
                    ? '#EBF3F1'
                    : post.status === 'failed'
                    ? '#FBEAE8'
                    : '#ECEEEA',
                color:
                  post.status === 'published'
                    ? '#2B6E63'
                    : post.status === 'failed'
                    ? '#B34A3C'
                    : '#1C2321',
              }}
            >
              {post.status.toUpperCase()}
            </span>
          </div>

          <button
            onClick={onClose}
            className="text-sm px-2 py-0.5 rounded transition-colors hover:bg-gray-100"
            style={{ color: '#9A9A93' }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* Post Content */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium" style={{ color: '#9A9A93' }}>
                Content
              </span>
              {canEdit && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs font-medium transition-colors hover:underline"
                  style={{ color: '#2B6E63' }}
                >
                  Edit
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-3">
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  rows={4}
                  className="w-full border rounded p-2.5 text-sm outline-none resize-none"
                  style={{ borderColor: '#2B6E63', background: '#fff', color: '#1C2321' }}
                />
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9A9A93' }}>
                    Scheduled Time
                  </label>
                  <input
                    type="datetime-local"
                    value={editedSchedule}
                    onChange={(e) => setEditedSchedule(e.target.value)}
                    className="border rounded px-3 py-1.5 text-sm outline-none w-full"
                    style={{ borderColor: '#D8DAD5', background: '#fff', color: '#1C2321' }}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1 text-xs border rounded transition-colors hover:bg-white"
                    style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                    className="px-3 py-1 text-xs font-medium rounded transition-opacity"
                    style={{ background: '#2B6E63', color: '#fff' }}
                  >
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="p-3 border rounded text-sm leading-relaxed whitespace-pre-wrap"
                style={{ borderColor: '#D8DAD5', background: '#fff', color: '#1C2321' }}
              >
                {post.content}
              </div>
            )}
          </div>

          {/* Failure reason if any */}
          {post.status === 'failed' && post.error_reason && (
            <div
              className="p-3 border rounded text-xs flex items-center justify-between"
              style={{ borderColor: '#B34A3C', background: '#FBEAE8', color: '#B34A3C' }}
            >
              <span>{post.error_reason}</span>
              <button
                onClick={handleRetry}
                disabled={isActing}
                className="ml-3 px-2 py-0.5 border rounded text-xs hover:bg-white"
                style={{ borderColor: '#B34A3C', color: '#B34A3C' }}
              >
                {isActing ? '…' : 'Retry'}
              </button>
            </div>
          )}

          {/* Metadata grid */}
          <div
            className="grid grid-cols-2 gap-2 p-3 border rounded text-xs"
            style={{ borderColor: '#D8DAD5', background: '#fff' }}
          >
            <div>
              <span className="block" style={{ color: '#9A9A93' }}>Post ID</span>
              <span className="font-mono truncate block" style={{ color: '#1C2321' }}>{post.id}</span>
            </div>
            <div>
              <span className="block" style={{ color: '#9A9A93' }}>Platform Post ID</span>
              <span className="font-mono truncate block" style={{ color: '#1C2321' }}>
                {post.platform_post_id || '—'}
              </span>
            </div>
            <div>
              <span className="block" style={{ color: '#9A9A93' }}>Scheduled</span>
              <span style={{ color: '#1C2321' }}>
                {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString('en-GB') : '—'}
              </span>
            </div>
            <div>
              <span className="block" style={{ color: '#9A9A93' }}>Published</span>
              <span style={{ color: '#1C2321' }}>
                {post.published_at ? new Date(post.published_at).toLocaleString('en-GB') : '—'}
              </span>
            </div>
          </div>

          {/* Metrics if published */}
          {post.status === 'published' && (
            <div>
              <span className="block text-xs font-medium mb-1.5" style={{ color: '#9A9A93' }}>
                Latest Metrics History
              </span>
              {metrics.length === 0 ? (
                <p className="text-xs" style={{ color: '#9A9A93' }}>
                  No metrics recorded yet. Metrics sync periodically.
                </p>
              ) : (
                <div className="space-y-1">
                  {metrics.map((m, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 border rounded text-xs"
                      style={{ borderColor: '#D8DAD5', background: '#fff' }}
                    >
                      <span style={{ color: '#9A9A93' }}>
                        {new Date(m.fetched_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex gap-3 font-medium" style={{ color: '#1C2321' }}>
                        <span>{m.impressions} Views</span>
                        <span>{m.likes} Likes</span>
                        <span>{m.comments} Comments</span>
                        <span>{m.shares} Shares</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3 border-t shrink-0"
          style={{ borderColor: '#D8DAD5' }}
        >
          <div>
            {!post.approved_by && post.status !== 'published' && (
              <button
                onClick={handleApprove}
                disabled={isActing || role !== 'admin'}
                className="px-3 py-1.5 text-xs border rounded transition-colors hover:bg-white"
                style={{
                  borderColor: role === 'admin' ? '#2B6E63' : '#D8DAD5',
                  color: role === 'admin' ? '#2B6E63' : '#9A9A93',
                }}
                title={role !== 'admin' ? 'Requires admin role' : 'Approve post'}
              >
                {isActing ? '…' : role === 'admin' ? 'Approve Post' : 'Approve (Admin only)'}
              </button>
            )}
            {post.approved_by && (
              <span className="text-xs font-medium" style={{ color: '#2B6E63' }}>
                ✓ Approved
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs border rounded transition-colors hover:bg-white"
            style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
