'use client';

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import {
  Post,
  PlatformSummary,
  Platform,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  fetchMetricsSummary,
  fetchPostMetrics,
  syncMetrics,
  PostMetric,
} from '@/lib/api';
import PlatformLogo from './PlatformLogo';

const RANGES = ['Last 7 days', 'Last 30 days', 'This month'] as const;
type Range = typeof RANGES[number];

const customTooltipStyle = {
  background: '#FAFAF8',
  border: '1px solid #D8DAD5',
  borderRadius: 4,
  fontSize: 12,
  color: '#1C2321',
  boxShadow: 'none',
};

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded px-4 py-3" style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}>
      <div className="text-xs mb-1" style={{ color: '#9A9A93' }}>{label}</div>
      <div className="text-xl font-semibold" style={{ color: '#1C2321' }}>{value}</div>
    </div>
  );
}

interface Props {
  posts: Post[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function AnalyticsView({ posts, showToast }: Props) {
  const [range, setRange] = useState<Range>('Last 30 days');
  const [metric, setMetric] = useState<'impressions' | 'engagement'>('impressions');
  const [summary, setSummary] = useState<PlatformSummary[]>([]);
  const [syncing, setSyncing] = useState(false);

  const loadSummary = async () => {
    try {
      const data = await fetchMetricsSummary();
      setSummary(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await syncMetrics();
      showToast(`Synced metrics for ${res.posts_analyzed} posts`);
      loadSummary();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Aggregate totals
  const totals = summary.reduce(
    (acc, s) => ({
      impressions: acc.impressions + s.total_impressions,
      likes: acc.likes + s.total_likes,
      comments: acc.comments + s.total_comments,
      shares: acc.shares + s.total_shares,
    }),
    { impressions: 0, likes: 0, comments: 0, shares: 0 }
  );

  // Build chart data from summary (one bar per platform)
  const chartData = summary.map((s) => ({
    platform: PLATFORM_LABELS[s.platform] ?? s.platform,
    [s.platform]: metric === 'impressions' ? s.total_impressions : s.total_likes + s.total_comments + s.total_shares,
  }));

  // Merge into single array keyed by week label (simulate weekly bucketing from summary)
  const mergedChart = summary.length > 0
    ? [
        summary.reduce<Record<string, number | string>>(
          (obj, s) => {
            obj[s.platform] = metric === 'impressions' ? s.total_impressions : s.total_likes + s.total_comments + s.total_shares;
            return obj;
          },
          { week: 'All time' }
        ),
      ]
    : [];

  const published = posts.filter((p) => p.status === 'published');
  const platforms = summary.map((s) => s.platform);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-base font-semibold" style={{ color: '#1C2321' }}>
            Analytics
          </h1>
          <div className="flex items-center gap-2">
            <button
              id="analytics-sync-btn"
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-1 text-xs rounded border transition-colors hover:bg-white"
              style={{ borderColor: '#2B6E63', color: '#2B6E63' }}
            >
              {syncing ? 'Syncing…' : 'Sync metrics'}
            </button>
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className="px-3 py-1 text-xs rounded transition-colors"
                style={{
                  background: range === r ? '#1C2321' : 'transparent',
                  color: range === r ? '#F4F5F2' : '#9A9A93',
                  border: `1px solid ${range === r ? '#1C2321' : '#D8DAD5'}`,
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatTile label="Impressions" value={totals.impressions.toLocaleString()} />
          <StatTile label="Likes" value={totals.likes.toLocaleString()} />
          <StatTile label="Comments" value={totals.comments.toLocaleString()} />
          <StatTile label="Shares" value={totals.shares.toLocaleString()} />
        </div>

        {/* Chart */}
        <div className="border rounded p-4 mb-6" style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium" style={{ color: '#1C2321' }}>
              {metric === 'impressions' ? 'Impressions by platform' : 'Engagement by platform'}
            </h2>
            <div className="flex gap-1">
              {(['impressions', 'engagement'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className="px-2.5 py-1 text-xs border rounded transition-colors"
                  style={{
                    borderColor: metric === m ? '#2B6E63' : '#D8DAD5',
                    background: metric === m ? '#EBF3F1' : 'transparent',
                    color: metric === m ? '#2B6E63' : '#9A9A93',
                  }}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {mergedChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mergedChart} barGap={2} barSize={18}>
                <CartesianGrid vertical={false} stroke="#E8EAE5" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: '#9A9A93' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9A9A93' }}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                />
                <Tooltip contentStyle={customTooltipStyle} cursor={{ fill: '#E8EAE512' }} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                  formatter={(value) => PLATFORM_LABELS[value as Platform] ?? value}
                />
                {platforms.map((p) => (
                  <Bar
                    key={p}
                    dataKey={p}
                    fill={PLATFORM_COLORS[p]}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-xs" style={{ color: '#9A9A93' }}>
              No metrics data yet. Click "Sync metrics" to pull latest engagement.
            </div>
          )}
        </div>

        {/* Per-post table */}
        <div>
          <h2 className="text-sm font-medium mb-3" style={{ color: '#1C2321' }}>
            Post performance
          </h2>
          <div className="border rounded overflow-hidden" style={{ borderColor: '#D8DAD5' }}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: '#F4F5F2', borderBottom: '1px solid #D8DAD5' }}>
                  {['Post', 'Platform', 'Date', 'Platform Post ID'].map((col) => (
                    <th
                      key={col}
                      className="text-left px-4 py-2.5 text-xs font-medium whitespace-nowrap"
                      style={{ color: '#9A9A93' }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {published.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-xs" style={{ color: '#9A9A93' }}>
                      No published posts yet.
                    </td>
                  </tr>
                )}
                {published.map((post, i) => (
                  <tr
                    key={post.id}
                    style={{
                      borderBottom: '1px solid #D8DAD5',
                      background: i % 2 === 0 ? '#FAFAF8' : '#F4F5F2',
                    }}
                  >
                    <td className="px-4 py-3" style={{ maxWidth: 280 }}>
                      <p
                        className="text-xs truncate"
                        style={{ color: '#1C2321' }}
                        title={post.content}
                      >
                        {post.content}
                      </p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="flex items-center gap-2 text-xs" style={{ color: '#1C2321' }}>
                        <PlatformLogo platform={post.platform} size={16} />
                        {PLATFORM_LABELS[post.platform]}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: '#9A9A93' }}>
                      {post.published_at
                        ? new Date(post.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: '#9A9A93', fontFamily: 'monospace' }}>
                      {post.platform_post_id ? post.platform_post_id.slice(0, 28) + '…' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
