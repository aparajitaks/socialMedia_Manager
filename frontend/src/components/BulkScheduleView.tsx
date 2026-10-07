'use client';

import { useState } from 'react';
import {
  SocialAccount,
  BulkValidationResult,
  validateBulkCSV,
  importBulkWrapped,
} from '@/lib/api';
import PlatformLogo from './PlatformLogo';

interface Props {
  accounts: SocialAccount[];
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onImportComplete?: () => void;
}

const SAMPLE_CSV = `date,time,platform,account,caption,media
2026-10-01,10:00,linkedin,Company Page,"Excited to announce our Q4 agency roadmap! Growth ahead. 🚀",
2026-10-02,14:30,facebook,Marketing Hub,"Client success story: How we increased organic conversions by 40%.",https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800
2026-10-03,09:00,instagram,Agency Brand,"Behind the scenes with our creative design team today. ✨",https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800`;

export default function BulkScheduleView({ accounts, showToast, onImportComplete }: Props) {
  const [csvContent, setCsvContent] = useState('');
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<BulkValidationResult | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setCsvContent(text);
      setResult(null);
    };
    reader.readAsText(file);
  };

  const handleLoadSample = () => {
    setCsvContent(SAMPLE_CSV);
    setResult(null);
  };

  const handleValidate = async () => {
    if (!csvContent.trim()) {
      showToast('Please upload or paste CSV content first', 'error');
      return;
    }
    setValidating(true);
    try {
      const data = await validateBulkCSV(csvContent);
      setResult(data);
      if (data.invalid_count > 0) {
        showToast(`Validation found ${data.invalid_count} row errors. Review below.`, 'error');
      } else {
        showToast(`All ${data.valid_count} rows validated successfully! Ready to schedule.`);
      }
    } catch (err: any) {
      showToast(err.message || 'Validation failed', 'error');
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!result || result.valid_rows.length === 0) return;
    setImporting(true);
    try {
      const res = await importBulkWrapped(result.valid_rows);
      showToast(`Successfully scheduled ${res.imported_count} posts from CSV!`);
      setCsvContent('');
      setResult(null);
      if (onImportComplete) onImportComplete();
    } catch (err: any) {
      showToast(err.message || 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto space-y-6" style={{ background: '#F4F5F2' }}>
      {/* Header */}
      <div className="p-6 rounded-xl border" style={{ background: '#fff', borderColor: '#D8DAD5' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: '#1C2321' }}>
              Bulk CSV Post Scheduler
            </h1>
            <p className="text-xs" style={{ color: '#9A9A93' }}>
              Schedule dozens or hundreds of posts at once across LinkedIn, Meta, Instagram, X, and Google Business.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadSample}
              className="text-xs px-3 py-1.5 rounded border font-medium hover:bg-gray-50"
              style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
            >
              📄 Load Sample CSV
            </button>
          </div>
        </div>
      </div>

      {/* CSV Input Card */}
      <div className="p-6 rounded-xl border space-y-4" style={{ background: '#fff', borderColor: '#D8DAD5' }}>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold" style={{ color: '#1C2321' }}>
            Upload CSV File or Paste Raw Content
          </label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileUpload}
            className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border file:text-xs file:bg-gray-50"
          />
        </div>

        <textarea
          rows={7}
          value={csvContent}
          onChange={(e) => {
            setCsvContent(e.target.value);
            setResult(null);
          }}
          placeholder="date,time,platform,account,caption,media&#10;2026-10-01,10:00,linkedin,Acme Co,Announcement message..."
          className="w-full font-mono text-xs p-3 rounded-lg border outline-none resize-y"
          style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}
        />

        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px]" style={{ color: '#9A9A93' }}>
            Columns accepted: <code className="bg-gray-100 px-1 py-0.5 rounded">date, time, platform, caption, media, account</code>
          </span>
          <div className="flex items-center gap-2">
            <button
              id="bulk-validate-btn"
              onClick={handleValidate}
              disabled={validating || !csvContent.trim()}
              className="px-4 py-2 rounded text-xs font-medium border transition-colors hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
            >
              {validating ? 'Validating…' : '🔍 Validate CSV Rows'}
            </button>
            {result && result.can_import && (
              <button
                id="bulk-import-btn"
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 rounded text-xs font-medium transition-colors text-white disabled:opacity-50"
                style={{ background: '#2B6E63' }}
              >
                {importing ? 'Scheduling…' : `🚀 Schedule All ${result.valid_count} Posts`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Validation Results */}
      {result && (
        <div className="p-6 rounded-xl border space-y-4" style={{ background: '#fff', borderColor: '#D8DAD5' }}>
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: '#D8DAD5' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
              Validation Summary
            </h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-700 font-medium">✓ {result.valid_count} Valid</span>
              {result.invalid_count > 0 && (
                <span className="text-red-600 font-medium">✕ {result.invalid_count} Invalid</span>
              )}
            </div>
          </div>

          {/* Warnings */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="p-3 rounded-lg border text-xs space-y-1" style={{ background: '#FEF3C7', borderColor: '#F59E0B' }}>
              <div className="font-semibold text-amber-800">⚠️ Scheduling Warnings</div>
              {result.warnings.map((w, i) => (
                <div key={i} className="text-amber-700">{w}</div>
              ))}
            </div>
          )}

          {/* Errors List */}
          {result.invalid_rows && result.invalid_rows.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-red-600">Rows Requiring Correction</div>
              {result.invalid_rows.map((inv) => (
                <div
                  key={inv.row_number}
                  className="p-3 rounded-lg border text-xs space-y-1"
                  style={{ background: '#FEF2F2', borderColor: '#FCA5A5' }}
                >
                  <div className="font-semibold text-red-800">Row {inv.row_number}:</div>
                  <ul className="list-disc list-inside text-red-700">
                    {inv.errors.map((err, ei) => (
                      <li key={ei}>{err}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Valid Preview Table */}
          {result.valid_rows && result.valid_rows.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold" style={{ color: '#1C2321' }}>
                Valid Posts Ready for Schedule
              </div>
              <div className="border rounded-lg overflow-x-auto" style={{ borderColor: '#D8DAD5' }}>
                <table className="w-full text-left text-xs">
                  <thead style={{ background: '#FAFAF8', borderBottom: '1px solid #D8DAD5' }}>
                    <tr>
                      <th className="p-2.5 font-medium" style={{ color: '#9A9A93' }}>Slot</th>
                      <th className="p-2.5 font-medium" style={{ color: '#9A9A93' }}>Platform</th>
                      <th className="p-2.5 font-medium" style={{ color: '#9A9A93' }}>Account</th>
                      <th className="p-2.5 font-medium" style={{ color: '#9A9A93' }}>Caption</th>
                      <th className="p-2.5 font-medium" style={{ color: '#9A9A93' }}>Media</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: '#E8EAE6' }}>
                    {result.valid_rows.map((row) => (
                      <tr key={row.row_number} className="hover:bg-gray-50">
                        <td className="p-2.5 whitespace-nowrap font-mono text-[11px]">
                          {row.date} {row.time}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <PlatformLogo platform={row.platform} size={12} />
                            <span className="capitalize">{row.platform}</span>
                          </span>
                        </td>
                        <td className="p-2.5 truncate max-w-[120px]" style={{ color: '#1C2321' }}>
                          {row.display_name}
                        </td>
                        <td className="p-2.5 truncate max-w-[280px]" style={{ color: '#1C2321' }}>
                          {row.caption}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          {row.media_urls && row.media_urls.length > 0 ? (
                            <span className="text-[10px] text-green-700 font-medium">✓ Media</span>
                          ) : (
                            <span className="text-[10px] text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
