'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SocialAccount,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  Platform,
  Client,
  PostVariant,
  ValidationResult,
  fetchClients,
  createPosts,
  uploadMedia,
  validatePostPayload,
  duplicatePost,
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

type ActionType = 'draft' | 'approval' | 'schedule';

interface VariantState {
  content: string;
  mediaUrls: string[];
  title?: string;
  firstComment?: string;
  link?: string;
}

export default function ComposerPanel({
  accounts,
  initialDate,
  onClose,
  onCreated,
  showToast,
}: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>('base'); // 'base' or account id

  // Base content (propagates to platform variants when edited in base tab)
  const [baseContent, setBaseContent] = useState('');
  const [baseMediaUrls, setBaseMediaUrls] = useState<string[]>([]);
  const [baseTitle, setBaseTitle] = useState('');
  const [baseFirstComment, setBaseFirstComment] = useState('');
  const [baseLink, setBaseLink] = useState('');

  // Per-account variant customizations
  const [variants, setVariants] = useState<Record<string, VariantState>>({});

  // Scheduling & Campaign metadata
  const [date, setDate] = useState(
    initialDate ? initialDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [time, setTime] = useState('09:00');
  const [label, setLabel] = useState('');

  // UI state
  const [previewMode, setPreviewMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [validation, setValidation] = useState<Record<string, ValidationResult>>({});
  const [createdPostId, setCreatedPostId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Load clients
  useEffect(() => {
    fetchClients()
      .then((cls) => {
        setClients(cls);
        if (cls.length > 0 && accounts.length > 0) {
          const firstAccountClient = accounts[0].client_id;
          if (firstAccountClient) setSelectedClientId(firstAccountClient);
        }
      })
      .catch(() => {});
  }, [accounts]);

  // Filter accounts by client
  const availableAccounts =
    selectedClientId === 'all'
      ? accounts
      : accounts.filter((a) => a.client_id === selectedClientId);

  // Default: select first available account
  useEffect(() => {
    if (availableAccounts.length > 0 && selectedIds.length === 0) {
      setSelectedIds([availableAccounts[0].id]);
    }
  }, [availableAccounts, selectedIds]);

  const selectedAccounts = accounts.filter((a) => selectedIds.includes(a.id));

  // Toggle account selection
  const toggleAccount = (id: string) => {
    setSelectedIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
      // Initialize variant state if newly added
      if (!exists && !variants[id]) {
        setVariants((v) => ({
          ...v,
          [id]: {
            content: baseContent,
            mediaUrls: [...baseMediaUrls],
            title: baseTitle,
            firstComment: baseFirstComment,
            link: baseLink,
          },
        }));
      }
      if (next.length > 0 && !next.includes(activeTab) && activeTab !== 'base') {
        setActiveTab('base');
      }
      setSaveStatus('unsaved');
      return next;
    });
  };

  // Update base content & sync to untouched variants
  const handleBaseContentChange = (val: string) => {
    setBaseContent(val);
    setSaveStatus('unsaved');
    setVariants((prev) => {
      const updated = { ...prev };
      for (const id of selectedIds) {
        if (!updated[id] || updated[id].content === baseContent) {
          updated[id] = { ...(updated[id] || { mediaUrls: [] }), content: val };
        }
      }
      return updated;
    });
  };

  // Update variant field
  const updateVariantField = (
    accId: string,
    field: keyof VariantState,
    value: any
  ) => {
    setSaveStatus('unsaved');
    setVariants((prev) => {
      const current = prev[accId] || {
        content: baseContent,
        mediaUrls: [...baseMediaUrls],
        title: baseTitle,
        firstComment: baseFirstComment,
        link: baseLink,
      };
      return {
        ...prev,
        [accId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  // Upload handler
  const handleFileUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 100 * 1024 * 1024) {
          showToast(`${file.name} is too large (max 100MB)`, 'error');
          continue;
        }
        try {
          const url = await uploadMedia(file);
          newUrls.push(url);
        } catch (err: any) {
          showToast(`Failed to upload ${file.name}: ${err.message}`, 'error');
        }
      }

      if (newUrls.length > 0) {
        setSaveStatus('unsaved');
        if (activeTab === 'base') {
          setBaseMediaUrls((prev) => [...prev, ...newUrls]);
          // Sync to variants
          setVariants((prev) => {
            const updated = { ...prev };
            for (const id of selectedIds) {
              const cur = updated[id] || { content: baseContent, mediaUrls: [] };
              updated[id] = { ...cur, mediaUrls: [...cur.mediaUrls, ...newUrls] };
            }
            return updated;
          });
        } else {
          updateVariantField(activeTab, 'mediaUrls', [
            ...(variants[activeTab]?.mediaUrls || []),
            ...newUrls,
          ]);
        }
        showToast(`${newUrls.length} file(s) attached`);
      }
      setUploading(false);
    },
    [activeTab, baseContent, baseMediaUrls, selectedIds, showToast, variants]
  );

  // Live validation on active tab changes or content updates
  useEffect(() => {
    const runValidation = async () => {
      const results: Record<string, ValidationResult> = {};
      for (const acc of selectedAccounts) {
        const v = variants[acc.id] || {
          content: baseContent,
          mediaUrls: baseMediaUrls,
        };
        try {
          const res = await validatePostPayload({
            platform: acc.platform,
            content: v.content,
            media_urls: v.mediaUrls,
            title: v.title,
            first_comment: v.firstComment,
            link: v.link,
          });
          results[acc.id] = res;
        } catch {
          // ignore network validation errors in background
        }
      }
      setValidation(results);
    };

    const timer = setTimeout(runValidation, 400);
    return () => clearTimeout(timer);
  }, [baseContent, baseMediaUrls, selectedAccounts, variants]);

  // Main Submit Action
  const handleAction = async (type: ActionType) => {
    if (selectedIds.length === 0) {
      showToast('Select at least one social account', 'error');
      return;
    }

    setSubmitting(true);
    setSaveStatus('saving');

    try {
      const scheduledAt =
        type === 'schedule'
          ? new Date(`${date}T${time}:00`).toISOString()
          : undefined;

      const postStatus =
        type === 'approval'
          ? 'pending_approval'
          : type === 'draft'
          ? 'draft'
          : 'scheduled';

      // Build platform variants array
      const payloadVariants = selectedAccounts.map((acc) => {
        const v = variants[acc.id] || {
          content: baseContent,
          mediaUrls: baseMediaUrls,
        };
        return {
          social_account_id: acc.id,
          platform: acc.platform,
          content: v.content || baseContent,
          media_urls: v.mediaUrls && v.mediaUrls.length > 0 ? v.mediaUrls : baseMediaUrls,
          title: v.title || baseTitle || undefined,
          first_comment: v.firstComment || baseFirstComment || undefined,
          link: v.link || baseLink || undefined,
        };
      });

      const effectiveClientId =
        selectedClientId !== 'all' ? selectedClientId : selectedAccounts[0]?.client_id;

      const response = await createPosts({
        label: label || undefined,
        campaign_label: label || undefined,
        scheduled_at: scheduledAt,
        status: postStatus,
        client_id: effectiveClientId,
        content: baseContent || payloadVariants[0]?.content || '',
        media_urls: baseMediaUrls,
        variants: payloadVariants,
      } as any);

      const created = (response as any).post || (response as any).posts?.[0];
      if (created?.id) {
        setCreatedPostId(created.id);
      }

      setSaveStatus('saved');
      const msg =
        type === 'draft'
          ? 'Draft saved successfully!'
          : type === 'approval'
          ? 'Submitted for approval!'
          : 'Post scheduled successfully!';
      showToast(msg);

      setTimeout(() => {
        onCreated();
        onClose();
      }, 900);
    } catch (err: any) {
      setSaveStatus('unsaved');
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Duplicate Action
  const handleDuplicate = async () => {
    if (!createdPostId) {
      showToast('Save the post first before duplicating', 'error');
      return;
    }
    try {
      await duplicatePost(createdPostId);
      showToast('✓ Cloned into a new draft!');
      onCreated();
    } catch (err: any) {
      showToast(`Duplication failed: ${err.message}`, 'error');
    }
  };

  // Active account & variant data
  const currentAccount = accounts.find((a) => a.id === activeTab);
  const currentVariant = currentAccount
    ? variants[currentAccount.id] || {
        content: baseContent,
        mediaUrls: baseMediaUrls,
      }
    : null;

  const currentContent =
    activeTab === 'base' ? baseContent : currentVariant?.content ?? '';
  const currentMediaUrls =
    activeTab === 'base' ? baseMediaUrls : currentVariant?.mediaUrls ?? [];
  const currentLimit = currentAccount ? CHAR_LIMITS[currentAccount.platform] ?? 3000 : 3000;
  const currentRemaining = currentLimit - currentContent.length;

  const currentValidation = currentAccount ? validation[currentAccount.id] : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(28,35,33,0.35)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Slide-Over Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col border-l shadow-2xl overflow-hidden transition-all duration-300"
        style={{ width: 620, maxWidth: '100vw', background: '#FAFAF8', borderColor: '#D8DAD5' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-white"
          style={{ borderColor: '#D8DAD5' }}
        >
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold tracking-tight" style={{ color: '#1C2321' }}>
              Multi-Platform Composer
            </h2>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition-colors ${
                saveStatus === 'saved'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : saveStatus === 'saving'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {saveStatus === 'saved'
                ? 'All changes saved ✓'
                : saveStatus === 'saving'
                ? 'Saving…'
                : 'Unsaved changes'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {createdPostId && (
              <button
                type="button"
                onClick={handleDuplicate}
                className="text-xs px-2.5 py-1 border rounded-md font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                style={{ borderColor: '#D8DAD5' }}
                title="Duplicate into a new draft"
              >
                ⎘ Duplicate
              </button>
            )}

            <button
              type="button"
              onClick={() => setPreviewMode(!previewMode)}
              className={`text-xs px-2.5 py-1 rounded-md font-semibold border transition-colors ${
                previewMode
                  ? 'bg-emerald-800 text-white border-emerald-800'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
              }`}
            >
              {previewMode ? 'Edit Mode' : 'Feed Preview 👁'}
            </button>

            <button
              id="composer-close-btn"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none px-2 py-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Brand / Client Selector */}
          {clients.length > 0 && (
            <div className="p-3.5 rounded-xl border bg-white shadow-xs" style={{ borderColor: '#E8EAE6' }}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-700">Client Brand</label>
                <span className="text-[11px] text-gray-400">Controls accessible channels</span>
              </div>
              <select
                value={selectedClientId}
                onChange={(e) => {
                  setSelectedClientId(e.target.value);
                  setSelectedIds([]);
                  setActiveTab('base');
                }}
                className="w-full px-3 py-1.5 text-xs rounded-lg border bg-white focus:outline-none"
                style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
              >
                <option value="all">All Brands</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Account Picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700">
                Publish to Accounts ({selectedIds.length} selected)
              </label>
              <span className="text-[11px] text-gray-400">Click to toggle channels</span>
            </div>

            {availableAccounts.length === 0 ? (
              <div className="p-3.5 rounded-xl border bg-amber-50/60 text-xs text-amber-800 border-amber-200">
                No connected accounts found for this brand. Visit Accounts to connect one.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableAccounts.map((acc) => {
                  const active = selectedIds.includes(acc.id);
                  const color = PLATFORM_COLORS[acc.platform];
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => toggleAccount(acc.id)}
                      className="flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-medium transition-all"
                      style={{
                        borderColor: active ? color : '#D8DAD5',
                        background: active ? color + '15' : '#fff',
                        color: active ? '#1C2321' : '#6A6F68',
                        boxShadow: active ? `0 1px 4px ${color}25` : 'none',
                      }}
                    >
                      <PlatformLogo platform={acc.platform} size={15} />
                      <span className="font-semibold">{acc.display_name}</span>
                      {active && <span style={{ color }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Campaign Label */}
          <div>
            <label className="block text-xs font-semibold mb-1 text-gray-700">
              Campaign Label (Optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setSaveStatus('unsaved');
              }}
              placeholder="e.g. Summer Release / Product Drop"
              id="composer-label-input"
              className="w-full border rounded-lg px-3 py-2 text-xs outline-none bg-white transition-colors"
              style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
              onFocus={(e) => (e.target.style.borderColor = '#2B6E63')}
              onBlur={(e) => (e.target.style.borderColor = '#D8DAD5')}
            />
          </div>

          {/* Variant Tabs */}
          {selectedAccounts.length > 0 && (
            <div className="border-b flex items-center gap-1.5 overflow-x-auto pb-1" style={{ borderColor: '#D8DAD5' }}>
              <button
                type="button"
                onClick={() => setActiveTab('base')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'base'
                    ? 'bg-emerald-900 text-white shadow-xs'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <span>🌐</span> Base Content
              </button>

              {selectedAccounts.map((acc) => {
                const isActive = activeTab === acc.id;
                const color = PLATFORM_COLORS[acc.platform];
                const accVal = validation[acc.id];
                const hasErrors = accVal && accVal.errors.length > 0;
                const hasWarnings = accVal && accVal.warnings.length > 0;

                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setActiveTab(acc.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border"
                    style={{
                      borderColor: isActive ? color : '#D8DAD5',
                      background: isActive ? color + '18' : '#fff',
                      color: isActive ? '#1C2321' : '#6A6F68',
                    }}
                  >
                    <PlatformLogo platform={acc.platform} size={14} />
                    <span>{PLATFORM_LABELS[acc.platform]}</span>
                    {hasErrors ? (
                      <span className="w-2 h-2 rounded-full bg-red-600 inline-block" title="Validation errors" />
                    ) : hasWarnings ? (
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" title="Validation warnings" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          {/* Feed Preview Mode */}
          {previewMode ? (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-gray-700 flex items-center justify-between">
                <span>Feed Appearance Mockup</span>
                <span className="text-[11px] text-gray-400">Pixel-accurate platform rendering</span>
              </div>

              {selectedAccounts.map((acc) => {
                const v = variants[acc.id] || {
                  content: baseContent,
                  mediaUrls: baseMediaUrls,
                };
                const color = PLATFORM_COLORS[acc.platform];

                return (
                  <div
                    key={acc.id}
                    className="p-4 rounded-xl border bg-white shadow-sm space-y-3"
                    style={{ borderColor: '#E8EAE6' }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs"
                        style={{ background: color + '20', color }}
                      >
                        {(acc.display_name || 'A').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-900">{acc.display_name}</div>
                        <div className="text-[10px] text-gray-400">
                          {acc.username ? `@${acc.username}` : PLATFORM_LABELS[acc.platform]} · Just now
                        </div>
                      </div>
                    </div>

                    <div className="text-xs leading-relaxed text-gray-800 whitespace-pre-wrap">
                      {v.content || <span className="text-gray-400 italic">No text provided</span>}
                    </div>

                    {v.mediaUrls && v.mediaUrls.length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5 rounded-lg overflow-hidden border border-gray-100">
                        {v.mediaUrls.map((m, idx) => (
                          <div key={idx} className="aspect-video bg-gray-100 relative">
                            {m.match(/\.(mp4|mov|webm)/i) ? (
                              <video src={m} className="w-full h-full object-cover" controls />
                            ) : (
                              <img src={m} alt="" className="w-full h-full object-cover" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {v.firstComment && (
                      <div className="p-2 rounded-lg bg-gray-50 border text-[11px] text-gray-600">
                        <span className="font-semibold text-gray-800">First Comment:</span> {v.firstComment}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {/* Content Editor */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700">
                    {activeTab === 'base'
                      ? 'Base Content (Synced across all variants)'
                      : `${PLATFORM_LABELS[currentAccount?.platform || 'x']} Specific Caption`}
                  </label>
                  {currentAccount && (
                    <span
                      className="text-xs font-mono font-semibold"
                      style={{
                        color:
                          currentRemaining < 0
                            ? '#DC2626'
                            : currentRemaining < 20
                            ? '#D97706'
                            : '#6B7280',
                      }}
                    >
                      {currentContent.length} / {currentLimit}
                    </span>
                  )}
                </div>

                <textarea
                  rows={6}
                  value={currentContent}
                  onChange={(e) => {
                    if (activeTab === 'base') {
                      handleBaseContentChange(e.target.value);
                    } else if (currentAccount) {
                      updateVariantField(currentAccount.id, 'content', e.target.value);
                    }
                  }}
                  placeholder={
                    activeTab === 'base'
                      ? 'Type core post announcement here. It will apply to all channels…'
                      : `Custom caption tailored for ${PLATFORM_LABELS[currentAccount?.platform || 'x']}…`
                  }
                  className="w-full border rounded-xl px-3.5 py-2.5 text-xs resize-none outline-none bg-white transition-colors leading-relaxed"
                  style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                  onFocus={(e) => (e.target.style.borderColor = '#2B6E63')}
                  onBlur={(e) => (e.target.style.borderColor = '#D8DAD5')}
                />

                {/* Validation Alerts */}
                {currentValidation && !currentValidation.valid && (
                  <div className="mt-2 space-y-1">
                    {currentValidation.errors.map((err, i) => (
                      <div
                        key={i}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 flex items-center gap-1.5"
                      >
                        <span>✕</span>
                        <span>{err.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {currentValidation && currentValidation.warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {currentValidation.warnings.map((warn, i) => (
                      <div
                        key={i}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5"
                      >
                        <span>▲</span>
                        <span>{warn.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Media Attachments */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700">
                    Media Attachments ({currentMediaUrls.length})
                  </label>
                  {uploading && (
                    <span className="text-[11px] font-semibold text-emerald-800 animate-pulse">
                      Uploading to cloud…
                    </span>
                  )}
                </div>

                {currentMediaUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2.5 mb-2.5">
                    {currentMediaUrls.map((url, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border border-gray-200 shadow-2xs">
                        {url.match(/\.(mp4|mov|webm)/i) ? (
                          <video src={url} className="w-16 h-16 object-cover" />
                        ) : (
                          <img src={url} alt="" className="w-16 h-16 object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSaveStatus('unsaved');
                            const next = currentMediaUrls.filter((_, idx) => idx !== i);
                            if (activeTab === 'base') {
                              setBaseMediaUrls(next);
                            } else if (currentAccount) {
                              updateVariantField(currentAccount.id, 'mediaUrls', next);
                            }
                          }}
                          className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFileUpload(e.dataTransfer.files);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed rounded-xl px-4 py-4 text-center text-xs cursor-pointer bg-white transition-colors hover:border-gray-400 hover:bg-gray-50/50"
                  style={{ borderColor: '#D8DAD5', color: '#6A6F68' }}
                >
                  <div className="font-semibold text-gray-800 mb-0.5">
                    Drop images, videos, or PDFs here
                  </div>
                  <div className="text-[11px] text-gray-400">
                    JPG, PNG, GIF, MP4, WebM (Max 100MB)
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files)}
                />
              </div>

              {/* Platform Specific Fields Accordion */}
              {activeTab !== 'base' && currentAccount && (
                <div className="p-4 rounded-xl border bg-white space-y-3" style={{ borderColor: '#E8EAE6' }}>
                  <div className="text-xs font-semibold text-gray-800">
                    {PLATFORM_LABELS[currentAccount.platform]} Advanced Settings
                  </div>

                  {/* First Comment for Instagram/Meta */}
                  {(currentAccount.platform === 'instagram' || currentAccount.platform === 'facebook') && (
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">
                        First Comment (Published automatically)
                      </label>
                      <input
                        type="text"
                        value={currentVariant?.firstComment || ''}
                        onChange={(e) =>
                          updateVariantField(currentAccount.id, 'firstComment', e.target.value)
                        }
                        placeholder="#hashtags or additional comments"
                        className="w-full border rounded-lg px-3 py-1.5 text-xs outline-none bg-white"
                        style={{ borderColor: '#D8DAD5' }}
                      />
                    </div>
                  )}

                  {/* Title for LinkedIn & Google Business */}
                  {(currentAccount.platform === 'linkedin' ||
                    currentAccount.platform === 'google_business') && (
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">
                        Post Title / Event Headline
                      </label>
                      <input
                        type="text"
                        value={currentVariant?.title || ''}
                        onChange={(e) =>
                          updateVariantField(currentAccount.id, 'title', e.target.value)
                        }
                        placeholder="Article title or special offer headline"
                        className="w-full border rounded-lg px-3 py-1.5 text-xs outline-none bg-white"
                        style={{ borderColor: '#D8DAD5' }}
                      />
                    </div>
                  )}

                  {/* Custom Link */}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">
                      Link / URL Attachment
                    </label>
                    <input
                      type="url"
                      value={currentVariant?.link || ''}
                      onChange={(e) => updateVariantField(currentAccount.id, 'link', e.target.value)}
                      placeholder="https://example.com/learn-more"
                      className="w-full border rounded-lg px-3 py-1.5 text-xs outline-none bg-white"
                      style={{ borderColor: '#D8DAD5' }}
                    />
                  </div>
                </div>
              )}

              {/* Schedule Timing */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700">
                  Target Schedule (Optional)
                </label>
                <div className="flex gap-2.5">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setSaveStatus('unsaved');
                    }}
                    id="composer-date-input"
                    className="border rounded-lg px-3 py-2 text-xs outline-none flex-1 bg-white"
                    style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                  />
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => {
                      setTime(e.target.value);
                      setSaveStatus('unsaved');
                    }}
                    id="composer-time-input"
                    className="border rounded-lg px-3 py-2 text-xs outline-none w-32 bg-white"
                    style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div
          className="flex items-center justify-between px-6 py-4 border-t bg-white shrink-0"
          style={{ borderColor: '#D8DAD5' }}
        >
          <div className="flex items-center gap-2">
            <button
              id="composer-draft-btn"
              type="button"
              onClick={() => handleAction('draft')}
              disabled={submitting || selectedIds.length === 0}
              className="px-3.5 py-2 text-xs font-medium border rounded-lg transition-colors hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
            >
              Save Draft
            </button>
            <button
              id="composer-approval-btn"
              type="button"
              onClick={() => handleAction('approval')}
              disabled={submitting || selectedIds.length === 0}
              className="px-3.5 py-2 text-xs font-medium border rounded-lg transition-colors hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: '#9A9A93', color: '#1C2321' }}
            >
              Submit for Approval
            </button>
          </div>

          <button
            id="composer-schedule-btn"
            type="button"
            onClick={() => handleAction('schedule')}
            disabled={submitting || selectedIds.length === 0}
            className="px-5 py-2 text-xs font-semibold rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: '#2B6E63' }}
          >
            {submitting ? 'Scheduling…' : 'Schedule Post'}
          </button>
        </div>
      </div>
    </>
  );
}
