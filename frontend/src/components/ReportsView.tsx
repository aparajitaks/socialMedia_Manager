'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ReportSummary,
  fetchReportSummary,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  Platform,
} from '@/lib/api';
import PlatformLogo from './PlatformLogo';

interface Props {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function ReportsView({ showToast }: Props) {
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('30d');

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      let fromDate: string | undefined;
      const now = new Date();
      if (period === '7d') {
        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (period === '30d') {
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      }
      const data = await fetchReportSummary(fromDate);
      setReport(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load report', 'error');
    } finally {
      setLoading(false);
    }
  }, [period, showToast]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto space-y-6" style={{ background: '#F4F5F2' }}>
      {/* Header */}
      <div className="p-6 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ background: '#fff', borderColor: '#D8DAD5' }}>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: '#1C2321' }}>
            Client Performance & ROI Report
          </h1>
          <p className="text-xs" style={{ color: '#9A9A93' }}>
            White-label ready executive overview of impressions, engagement rates, and top converting content.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Time Filter */}
          <div className="border rounded overflow-hidden flex" style={{ borderColor: '#D8DAD5' }}>
            {(['7d', '30d', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  background: period === p ? '#1C2321' : 'transparent',
                  color: period === p ? '#fff' : '#9A9A93',
                }}
              >
                {p === '7d' ? 'Last 7 Days' : p === '30d' ? 'Last 30 Days' : 'All Time'}
              </button>
            ))}
          </div>

          <button
            onClick={handlePrint}
            className="px-3 py-1.5 rounded border text-xs font-medium hover:bg-gray-50 transition-colors"
            style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
          >
            🖨️ Export PDF
          </button>
        </div>
      </div>

      {loading && !report ? (
        <div className="text-center py-12 text-xs" style={{ color: '#9A9A93' }}>
          Generating performance metrics report…
        </div>
      ) : report ? (
        <>
          {/* Grand Totals Metric Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border" style={{ background: '#fff', borderColor: '#D8DAD5' }}>
              <div className="text-xs font-medium" style={{ color: '#9A9A93' }}>Total Impressions</div>
              <div className="text-2xl font-bold mt-1" style={{ color: '#1C2321' }}>
                {report.totals.total_impressions.toLocaleString()}
              </div>
              <div className="text-[11px] mt-1 text-green-700 font-medium">Across all connected channels</div>
            </div>

            <div className="p-4 rounded-xl border" style={{ background: '#fff', borderColor: '#D8DAD5' }}>
              <div className="text-xs font-medium" style={{ color: '#9A9A93' }}>Total Engagement</div>
              <div className="text-2xl font-bold mt-1" style={{ color: '#2B6E63' }}>
                {report.totals.total_engagement.toLocaleString()}
              </div>
              <div className="text-[11px] mt-1" style={{ color: '#9A9A93' }}>
                {report.totals.total_likes} likes • {report.totals.total_comments} comments
              </div>
            </div>

            <div className="p-4 rounded-xl border" style={{ background: '#fff', borderColor: '#D8DAD5' }}>
              <div className="text-xs font-medium" style={{ color: '#9A9A93' }}>Avg. Engagement Rate</div>
              <div className="text-2xl font-bold mt-1" style={{ color: '#1C2321' }}>
                {report.totals.average_engagement_rate_pct}%
              </div>
              <div className="text-[11px] mt-1 text-green-700 font-medium">Industry benchmark: 1.5 - 2.5%</div>
            </div>

            <div className="p-4 rounded-xl border" style={{ background: '#fff', borderColor: '#D8DAD5' }}>
              <div className="text-xs font-medium" style={{ color: '#9A9A93' }}>Posts Published</div>
              <div className="text-2xl font-bold mt-1" style={{ color: '#1C2321' }}>
                {report.totals.published_posts_count}
              </div>
              <div className="text-[11px] mt-1" style={{ color: '#9A9A93' }}>
                {report.totals.connected_accounts_count} accounts connected
              </div>
            </div>
          </div>

          {/* Platform Performance Breakdown */}
          <div className="p-6 rounded-xl border space-y-4" style={{ background: '#fff', borderColor: '#D8DAD5' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
              Breakdown by Channel
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {report.platform_breakdown.map((pb) => (
                <div
                  key={pb.platform}
                  className="p-3.5 rounded-lg border space-y-2"
                  style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}
                >
                  <div className="flex items-center gap-2">
                    <PlatformLogo platform={pb.platform as Platform} size={14} />
                    <span className="text-xs font-semibold capitalize" style={{ color: '#1C2321' }}>
                      {PLATFORM_LABELS[pb.platform as Platform] || pb.platform}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 pt-1 border-t text-center" style={{ borderColor: '#E8EAE6' }}>
                    <div>
                      <div className="text-[10px]" style={{ color: '#9A9A93' }}>Views</div>
                      <div className="text-xs font-bold" style={{ color: '#1C2321' }}>{pb.total_impressions}</div>
                    </div>
                    <div>
                      <div className="text-[10px]" style={{ color: '#9A9A93' }}>Likes</div>
                      <div className="text-xs font-bold" style={{ color: '#1C2321' }}>{pb.total_likes}</div>
                    </div>
                    <div>
                      <div className="text-[10px]" style={{ color: '#9A9A93' }}>Comments</div>
                      <div className="text-xs font-bold" style={{ color: '#1C2321' }}>{pb.total_comments}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Converting Content */}
          <div className="p-6 rounded-xl border space-y-4" style={{ background: '#fff', borderColor: '#D8DAD5' }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
                  Top Performing Posts
                </h2>
                <p className="text-xs" style={{ color: '#9A9A93' }}>
                  Ranked by total engagement volume and audience interactions.
                </p>
              </div>
            </div>

            {report.top_posts.length === 0 ? (
              <div className="text-center py-6 text-xs" style={{ color: '#9A9A93' }}>
                No published post metrics recorded for this time window.
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto" style={{ borderColor: '#D8DAD5' }}>
                <table className="w-full text-left text-xs">
                  <thead style={{ background: '#FAFAF8', borderBottom: '1px solid #D8DAD5' }}>
                    <tr>
                      <th className="p-2.5 font-medium" style={{ color: '#9A9A93' }}>Post Content</th>
                      <th className="p-2.5 font-medium" style={{ color: '#9A9A93' }}>Platform</th>
                      <th className="p-2.5 font-medium" style={{ color: '#9A9A93' }}>Published</th>
                      <th className="p-2.5 font-medium text-right" style={{ color: '#9A9A93' }}>Likes</th>
                      <th className="p-2.5 font-medium text-right" style={{ color: '#9A9A93' }}>Comments</th>
                      <th className="p-2.5 font-medium text-right" style={{ color: '#9A9A93' }}>Engagement</th>
                      <th className="p-2.5 font-medium text-right" style={{ color: '#9A9A93' }}>Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: '#E8EAE6' }}>
                    {report.top_posts.map((tp) => (
                      <tr key={tp.id} className="hover:bg-gray-50">
                        <td className="p-2.5 max-w-[240px] truncate font-medium" style={{ color: '#1C2321' }}>
                          {tp.content}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <PlatformLogo platform={tp.platform} size={12} />
                            <span className="capitalize">{tp.platform}</span>
                          </span>
                        </td>
                        <td className="p-2.5 whitespace-nowrap text-[11px]" style={{ color: '#9A9A93' }}>
                          {new Date(tp.published_at).toLocaleDateString()}
                        </td>
                        <td className="p-2.5 text-right font-mono">{tp.likes}</td>
                        <td className="p-2.5 text-right font-mono">{tp.comments}</td>
                        <td className="p-2.5 text-right font-mono font-semibold" style={{ color: '#2B6E63' }}>
                          {tp.total_engagement}
                        </td>
                        <td className="p-2.5 text-right font-mono text-green-700 font-medium">
                          {tp.engagement_rate_pct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
