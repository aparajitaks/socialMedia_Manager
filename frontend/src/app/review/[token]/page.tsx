'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  facebook: 'Facebook',
  google_business: 'Google Business',
  x: 'X (Twitter)',
};

interface ReviewData {
  approval: {
    id: string;
    status: string;
    share_token: string;
    comment?: string;
  };
  post: {
    id: string;
    content: string;
    platform: string;
    media_urls?: string[];
    scheduled_at?: string;
    status: string;
  };
  account?: {
    display_name: string;
    platform: string;
  };
}

export default function ReviewPage() {
  const params = useParams();
  const token = params?.token as string;

  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const [approverName, setApproverName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ action: string; comment?: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/posts/review/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Failed to load review'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!action) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/review/${token}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comment, approver_name: approverName }),
      });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || 'Action failed');
      setDone({ action, comment });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4F5F2' }}>
      <div className="text-sm" style={{ color: '#9A9A93' }}>Loading post for review…</div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F4F5F2' }}>
      <div className="max-w-md w-full border rounded p-6 text-center" style={{ background: '#FAFAF8', borderColor: '#D8DAD5' }}>
        <div className="text-3xl mb-3">⚠️</div>
        <h1 className="text-base font-semibold mb-2" style={{ color: '#1C2321' }}>Review link not found</h1>
        <p className="text-sm" style={{ color: '#9A9A93' }}>{error}</p>
      </div>
    </div>
  );

  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F4F5F2' }}>
      <div className="max-w-md w-full border rounded p-8 text-center" style={{ background: '#FAFAF8', borderColor: '#D8DAD5' }}>
        <div className="text-4xl mb-4">{done.action === 'approve' ? '✅' : '❌'}</div>
        <h1 className="text-lg font-semibold mb-2" style={{ color: '#1C2321' }}>
          {done.action === 'approve' ? 'Post Approved!' : 'Post Rejected'}
        </h1>
        <p className="text-sm mb-3" style={{ color: '#9A9A93' }}>
          {done.action === 'approve'
            ? 'Your approval has been recorded. The post will be published as scheduled.'
            : 'Your feedback has been sent to the team. They will make revisions.'}
        </p>
        {done.comment && (
          <p className="text-xs px-4 py-2 border rounded" style={{ borderColor: '#D8DAD5', color: '#9A9A93', background: '#fff' }}>
            "{done.comment}"
          </p>
        )}
      </div>
    </div>
  );

  if (!data) return null;

  const { post, account, approval } = data;
  const alreadyActed = approval.status !== 'PENDING';

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: '#F4F5F2', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="text-xs font-semibold tracking-wide mb-1" style={{ color: '#9A9A93' }}>POSTLINE · POST REVIEW</div>
          <h1 className="text-xl font-semibold" style={{ color: '#1C2321' }}>Review this post</h1>
          <p className="text-sm mt-1" style={{ color: '#9A9A93' }}>
            You've been invited to review and approve the following social media post before it goes live.
          </p>
        </div>

        {/* Post card */}
        <div className="border rounded-lg overflow-hidden mb-5" style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}>
          {/* Platform badge */}
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: '#D8DAD5', background: '#fff' }}>
            <div>
              <span className="text-xs font-medium" style={{ color: '#1C2321' }}>
                {PLATFORM_LABELS[post.platform] ?? post.platform}
              </span>
              {account?.display_name && (
                <span className="ml-2 text-xs" style={{ color: '#9A9A93' }}>· {account.display_name}</span>
              )}
            </div>
            {post.scheduled_at && (
              <span className="text-xs" style={{ color: '#9A9A93' }}>
                Scheduled: {new Date(post.scheduled_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="px-5 py-4">
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#1C2321' }}>{post.content}</p>
          </div>

          {/* Media */}
          {post.media_urls && post.media_urls.length > 0 && (
            <div className="px-5 pb-4 flex flex-wrap gap-2">
              {post.media_urls.map((url, i) => (
                url.match(/\.(mp4|mov|webm)/i) ? (
                  <video key={i} src={url} controls className="max-w-full rounded" style={{ maxHeight: 200 }} />
                ) : (
                  <img key={i} src={url} alt="" className="rounded max-h-48 object-cover" />
                )
              ))}
            </div>
          )}
        </div>

        {/* Already acted */}
        {alreadyActed && (
          <div className="border rounded p-4 text-center" style={{
            borderColor: approval.status === 'APPROVED' ? '#2B6E63' : '#B34A3C',
            background: approval.status === 'APPROVED' ? '#EBF3F1' : '#FBEAE8'
          }}>
            <p className="text-sm font-medium" style={{ color: approval.status === 'APPROVED' ? '#2B6E63' : '#B34A3C' }}>
              {approval.status === 'APPROVED' ? '✓ You have already approved this post' : '✕ You have already rejected this post'}
            </p>
            {approval.comment && <p className="text-xs mt-1" style={{ color: '#9A9A93' }}>Comment: "{approval.comment}"</p>}
          </div>
        )}

        {/* Action form */}
        {!alreadyActed && (
          <div className="border rounded-lg p-5" style={{ borderColor: '#D8DAD5', background: '#fff' }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: '#1C2321' }}>Your decision</h2>

            <div className="mb-3">
              <label className="block text-xs font-medium mb-1" style={{ color: '#9A9A93' }}>Your name (optional)</label>
              <input
                type="text"
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className="w-full border rounded px-3 py-2 text-sm outline-none"
                style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium mb-1" style={{ color: '#9A9A93' }}>Comment (optional)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Add feedback or revision requests…"
                className="w-full border rounded px-3 py-2 text-sm resize-none outline-none"
                style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setAction('reject'); }}
                className={`flex-1 py-2.5 text-sm font-medium border rounded transition-colors ${action === 'reject' ? 'border-red-500' : ''}`}
                style={{
                  borderColor: action === 'reject' ? '#B34A3C' : '#D8DAD5',
                  background: action === 'reject' ? '#FBEAE8' : 'transparent',
                  color: action === 'reject' ? '#B34A3C' : '#9A9A93',
                }}
              >
                Request changes
              </button>
              <button
                onClick={() => { setAction('approve'); }}
                className="flex-1 py-2.5 text-sm font-medium border rounded transition-colors"
                style={{
                  borderColor: action === 'approve' ? '#2B6E63' : '#D8DAD5',
                  background: action === 'approve' ? '#EBF3F1' : 'transparent',
                  color: action === 'approve' ? '#2B6E63' : '#9A9A93',
                }}
              >
                Approve ✓
              </button>
            </div>

            {action && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full mt-3 py-2.5 text-sm font-medium rounded transition-opacity hover:opacity-90"
                style={{
                  background: action === 'approve' ? '#2B6E63' : '#B34A3C',
                  color: '#fff',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Submitting…' : `Confirm: ${action === 'approve' ? 'Approve this post' : 'Request changes'}`}
              </button>
            )}
          </div>
        )}

        <p className="text-xs text-center mt-6" style={{ color: '#9A9A93' }}>
          Powered by Postline — Social Media Management
        </p>
      </div>
    </div>
  );
}
