'use client';

import { useState, useEffect } from 'react';
import {
  SocialAccount,
  Platform,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  Client,
  deleteAccount,
  connectAccount,
  fetchOAuthConfigStatus,
  fetchClients,
  verifyAccount,
} from '@/lib/api';
import PlatformLogo from './PlatformLogo';

const PLATFORMS: { id: Platform; label: string; hint: string }[] = [
  { id: 'linkedin', label: 'LinkedIn', hint: 'Connect your LinkedIn Company Page' },
  { id: 'instagram', label: 'Instagram', hint: 'Connect your Instagram Business Account' },
  { id: 'facebook', label: 'Facebook', hint: 'Connect your Facebook Page' },
  { id: 'google_business', label: 'Google Business', hint: 'Connect your Google Business Profile' },
  { id: 'x', label: 'X (Twitter)', hint: 'Connect your X / Twitter account' },
];

const PLANNED_PLATFORMS = [
  { id: 'tiktok', label: 'TikTok', hint: 'Short-form video publishing (Direct Post API)' },
  { id: 'youtube', label: 'YouTube Shorts', hint: 'Video & Shorts publishing via Google API' },
  { id: 'pinterest', label: 'Pinterest', hint: 'Pins & Idea boards via Pinterest API' },
  { id: 'threads', label: 'Threads', hint: 'Meta Threads publishing API' },
  { id: 'bluesky', label: 'Bluesky', hint: 'AT Protocol federation publishing' },
];

function getStatusBadge(status?: string) {
  const s = String(status || 'CONNECTED').toUpperCase();
  if (s === 'CONNECTED') {
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">● Connected</span>;
  }
  if (s === 'TOKEN_EXPIRING') {
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">▲ Expiring Soon</span>;
  }
  if (s === 'TOKEN_EXPIRED' || s === 'EXPIRED') {
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">✕ Expired</span>;
  }
  if (s === 'REAUTH_REQUIRED' || s === 'NEEDS_RECONNECT') {
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">⟳ Reauth Required</span>;
  }
  if (s === 'DISCONNECTED') {
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">○ Disconnected</span>;
  }
  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">! Error</span>;
}

function renderCapabilityPills(caps?: any) {
  if (!caps) return null;
  const items = [
    { label: 'Text', enabled: caps.publishText },
    { label: 'Image', enabled: caps.publishImage },
    { label: 'Video', enabled: caps.publishVideo },
    { label: 'Carousel', enabled: caps.publishCarousel },
    { label: 'Doc', enabled: caps.publishDocument },
    { label: 'Analytics', enabled: caps.analytics },
  ].filter((i) => i.enabled);

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {items.map((item) => (
        <span key={item.label} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
          {item.label}
        </span>
      ))}
    </div>
  );
}

interface Props {
  accounts: SocialAccount[];
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onNavigateToSettings?: () => void;
}

export default function AccountsView({
  accounts,
  onRefresh,
  showToast,
  onNavigateToSettings,
}: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
  const [targetClientId, setTargetClientId] = useState<string>('');
  const [configStatus, setConfigStatus] = useState<Record<string, boolean>>({});
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Tab in Connect Modal: 'oauth' = real OAuth redirect, 'token' = paste long-lived token
  const [tab, setTab] = useState<'oauth' | 'token'>('oauth');
  const [manualToken, setManualToken] = useState('');
  const [manualDisplayName, setManualDisplayName] = useState('');
  const [manualExtId, setManualExtId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchOAuthConfigStatus().then(setConfigStatus).catch(() => {});
    fetchClients()
      .then((cls) => {
        setClients(cls);
        if (cls.length > 0 && !targetClientId) {
          setTargetClientId(cls[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Filter accounts by client and status
  const filteredAccounts = accounts.filter((a) => {
    if (selectedClientId !== 'all' && a.client_id !== selectedClientId) {
      return false;
    }
    if (statusFilter !== 'all') {
      const s = String(a.status || 'CONNECTED').toUpperCase();
      if (statusFilter === 'connected' && s !== 'CONNECTED') return false;
      if (statusFilter === 'expiring' && s !== 'TOKEN_EXPIRING') return false;
      if (statusFilter === 'expired' && s !== 'TOKEN_EXPIRED' && s !== 'EXPIRED') return false;
      if (statusFilter === 'reauth' && s !== 'REAUTH_REQUIRED' && s !== 'NEEDS_RECONNECT') return false;
      if (statusFilter === 'error' && s !== 'ERROR') return false;
    }
    return true;
  });

  const accountsByPlatform: Record<Platform, SocialAccount[]> = {
    linkedin: [],
    instagram: [],
    facebook: [],
    google_business: [],
    x: [],
  };
  for (const a of filteredAccounts) {
    if (accountsByPlatform[a.platform]) {
      accountsByPlatform[a.platform].push(a);
    }
  }

  const handleDisconnect = async (id: string, display: string) => {
    if (!confirm(`Disconnect "${display}"? This will stop any scheduled posts for this account.`)) return;
    setDisconnecting(id);
    try {
      await deleteAccount(id);
      showToast(`${display} disconnected`);
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setDisconnecting(null);
    }
  };

  const handleVerify = async (id: string, display: string) => {
    setVerifyingId(id);
    try {
      const res = await verifyAccount(id);
      showToast(`✓ Live Connection Verified: ${res.message || 'Token active and ready for publishing.'}`);
      onRefresh();
    } catch (err: any) {
      showToast(`Verification failed: ${err.message}`, 'error');
    } finally {
      setVerifyingId(null);
    }
  };

  const openConnectModal = (platform: Platform) => {
    setConnectingPlatform(platform);
    setTab('oauth');
    setManualToken('');
    setManualDisplayName('');
    setManualExtId('');
    setIsSubmitting(false);

    // Default target client
    if (selectedClientId !== 'all') {
      setTargetClientId(selectedClientId);
    } else if (clients.length > 0) {
      setTargetClientId(clients[0].id);
    }
  };

  // Primary: redirect browser directly to backend OAuth endpoint (bypasses Next.js proxy)
  // The backend issues a 302 → LinkedIn/Meta/Google/X. Next.js rewrites would intercept that redirect.
  const handleOAuthConnect = (forceSimulate = false) => {
    if (!connectingPlatform) return;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
    const clientIdParam = targetClientId ? `clientId=${encodeURIComponent(targetClientId)}` : '';
    const simulateParam = forceSimulate ? '&simulate=true' : '';
    const query = [clientIdParam, simulateParam].filter(Boolean).join('&');
    window.location.href = `${backendUrl}/api/social-accounts/${connectingPlatform}/connect${query ? `?${query}` : ''}`;
  };

  // Secondary: paste a long-lived access token directly
  const handleTokenConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectingPlatform) return;
    if (!manualToken.trim()) {
      showToast('Please paste your long-lived access token', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await connectAccount({
        platform: connectingPlatform,
        client_id: targetClientId || undefined,
        display_name: manualDisplayName.trim() || undefined,
        external_account_id: manualExtId.trim() || undefined,
        access_token: manualToken.trim(),
      });
      showToast(`Connected ${created.display_name} successfully!`);
      setConnectingPlatform(null);
      onRefresh();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Compute invite link for current client
  const activeClient = clients.find((c) => c.id === (selectedClientId === 'all' ? targetClientId : selectedClientId)) || clients[0];
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const inviteLink = activeClient ? `${origin}/connect/${activeClient.id}` : '';

  const copyInviteLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    showToast('✓ Client Invitation Link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 3000);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-6 max-w-4xl mx-auto space-y-6">
        {/* Top Header & Client Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold" style={{ color: '#1C2321' }}>
              Connected Social Accounts
            </h1>
            <p className="text-xs" style={{ color: '#9A9A93' }}>
              Multi-client social channel connections. Manage official Facebook, Instagram, LinkedIn, Google & X integrations.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Client Filter Dropdown */}
            {clients.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-gray-500 font-medium">Brand:</span>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border bg-white text-xs font-medium focus:outline-none"
                  style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                >
                  <option value="all">All Brands ({clients.length})</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Status Filter Dropdown */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-500 font-medium">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border bg-white text-xs font-medium focus:outline-none"
                style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
              >
                <option value="all">All Statuses</option>
                <option value="connected">Connected</option>
                <option value="expiring">Expiring Soon</option>
                <option value="reauth">Reauth Required</option>
                <option value="expired">Expired</option>
                <option value="error">Error</option>
              </select>
            </div>

            {/* Invite Client Button */}
            <button
              id="invite-client-btn"
              onClick={() => setInviteModalOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors bg-white hover:bg-gray-50"
              style={{ borderColor: '#2B6E63', color: '#2B6E63' }}
            >
              <span>🔗</span> Invite Client to Connect
            </button>
          </div>
        </div>

        {/* Live OAuth Integration Health Notice */}
        <div
          className="p-4 rounded-xl border text-xs space-y-3 shadow-sm"
          style={{ background: '#fff', borderColor: '#D8DAD5' }}
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs flex items-center gap-2" style={{ color: '#1C2321' }}>
              <span>🔑</span> Agency OAuth Integrations
            </span>
            {onNavigateToSettings && (
              <button
                onClick={onNavigateToSettings}
                className="text-[11px] font-medium text-emerald-800 hover:underline flex items-center gap-1"
              >
                <span>⚙️ Manage Developer Keys</span> ↗
              </button>
            )}
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: '#6A6F68' }}>
            To allow your marketing agency's clients to authenticate securely, configure your developer app credentials in Settings.
            All access tokens are encrypted with AES-256-GCM.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            {[
              { id: 'linkedin', name: 'LinkedIn' },
              { id: 'meta', name: 'Meta / IG' },
              { id: 'google_business', name: 'Google Business' },
              { id: 'x', name: 'X (Twitter)' },
            ].map((p) => {
              const active = !!configStatus[p.id];
              return (
                <div
                  key={p.id}
                  className="px-3 py-2 rounded-lg border text-[11px] flex items-center justify-between transition-colors"
                  style={{
                    borderColor: active ? '#2B6E63' : '#E8EAE6',
                    background: active ? '#EBF3F1' : '#FAFAF8',
                    color: active ? '#2B6E63' : '#9A9A93',
                  }}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="font-semibold">{active ? '● Live' : '○ Needs Keys'}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Platform Cards */}
        <div className="space-y-4">
          {PLATFORMS.map(({ id, label, hint }) => {
            const color = PLATFORM_COLORS[id];
            const platformAccounts = accountsByPlatform[id];
            const hasAccounts = platformAccounts.length > 0;

            return (
              <div
                key={id}
                className="border rounded-xl bg-white shadow-sm overflow-hidden"
                style={{ borderColor: '#D8DAD5' }}
              >
                {/* Platform header */}
                <div
                  className="flex items-center gap-3 px-5 py-4"
                  style={{ background: '#FAFAF8', borderBottom: hasAccounts ? '1px solid #E8EAE6' : undefined }}
                >
                  <PlatformLogo platform={id} size={30} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold" style={{ color: '#1C2321' }}>
                      {label}
                    </div>
                    <div className="text-xs" style={{ color: '#9A9A93' }}>
                      {hasAccounts
                        ? `${platformAccounts.length} account${platformAccounts.length !== 1 ? 's' : ''} connected`
                        : hint}
                    </div>
                  </div>
                  <button
                    id={`connect-btn-${id}`}
                    onClick={() => openConnectModal(id)}
                    className="px-3.5 py-1.5 text-xs font-semibold border rounded-lg transition-colors hover:bg-white flex items-center gap-1"
                    style={{ borderColor: color, color: color }}
                  >
                    + Connect
                  </button>
                </div>

                {/* Connected accounts list */}
                {platformAccounts.map((acc) => {
                  const clientObj = clients.find((c) => c.id === acc.client_id);
                  const clientLabel = clientObj ? clientObj.name : 'Primary Brand';
                  const isVerifying = verifyingId === acc.id;
                  const needsReconnect =
                    String(acc.status).toUpperCase() === 'REAUTH_REQUIRED' ||
                    String(acc.status).toUpperCase() === 'TOKEN_EXPIRED';

                  return (
                    <div
                      key={acc.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-t"
                      style={{ borderColor: '#E8EAE6', background: '#fff' }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: color + '20', color }}
                          >
                            {(acc.display_name || 'A').charAt(0).toUpperCase()}
                          </div>
                          <div className="absolute -bottom-1 -right-1">
                            <PlatformLogo platform={acc.platform} size={14} className="border border-white" />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold truncate" style={{ color: '#1C2321' }}>
                              {acc.display_name}
                            </span>
                            <span
                              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                              style={{ background: '#F4F5F2', color: '#2B6E63' }}
                            >
                              {clientLabel}
                            </span>
                            {getStatusBadge(acc.status)}
                          </div>
                          <div className="text-[11px] text-gray-500 truncate">
                            ID: {acc.platform_account_id || acc.external_account_id}
                            {(acc.last_verified_at || acc.last_synced_at) && (
                              <span className="ml-2 text-gray-400">
                                · Verified {new Date((acc.last_verified_at || acc.last_synced_at)!).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {renderCapabilityPills(acc.capabilities)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Reconnect button for expired/reauth */}
                        {needsReconnect && (
                          <button
                            id={`reconnect-btn-${acc.id}`}
                            onClick={() => openConnectModal(acc.platform)}
                            className="text-xs px-2.5 py-1.5 rounded-md font-semibold text-white transition-opacity hover:opacity-90"
                            style={{ background: '#D97706' }}
                          >
                            ⟳ Reconnect
                          </button>
                        )}

                        {/* Verify Live Connection Button */}
                        <button
                          id={`verify-btn-${acc.id}`}
                          onClick={() => handleVerify(acc.id, acc.display_name)}
                          disabled={isVerifying}
                          className="text-xs px-2.5 py-1.5 border rounded-md transition-colors hover:bg-gray-50 flex items-center gap-1 font-medium"
                          style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                          title="Verify token validity with the official provider API"
                        >
                          <span>{isVerifying ? '⏳' : '⚡'}</span>
                          <span>{isVerifying ? 'Testing…' : 'Verify Live'}</span>
                        </button>

                        {/* Disconnect Button */}
                        <button
                          id={`disconnect-btn-${acc.id}`}
                          onClick={() => handleDisconnect(acc.id, acc.display_name)}
                          disabled={disconnecting === acc.id}
                          className="text-xs px-2.5 py-1.5 border rounded-md transition-colors hover:bg-red-50 text-red-600"
                          style={{ borderColor: '#D8DAD5' }}
                        >
                          {disconnecting === acc.id ? '…' : 'Disconnect'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Planned Platforms (Roadmap Section) */}
        <div className="border rounded-xl bg-white shadow-sm overflow-hidden p-5 space-y-3" style={{ borderColor: '#D8DAD5' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold" style={{ color: '#1C2321' }}>
              Planned Channel Integrations
            </h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Roadmap
            </span>
          </div>
          <p className="text-xs text-gray-500">
            These platforms are designed in our architecture registry. Adapters are registered as unsupported until external OAuth credentials and developer app reviews are completed.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {PLANNED_PLATFORMS.map((p) => (
              <div
                key={p.id}
                className="p-3 rounded-lg border bg-gray-50/70 flex flex-col justify-between gap-1.5 opacity-80"
                style={{ borderColor: '#E8EAE6' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-800">{p.label}</span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-200/80 text-gray-600">
                    Coming Soon
                  </span>
                </div>
                <div className="text-[11px] text-gray-500">{p.hint}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Security Footer Info Box */}
        <div className="p-4 rounded-xl border text-xs" style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}>
          <p style={{ color: '#6A6F68' }}>
            OAuth tokens are stored encrypted using AES-256-GCM and refreshed in the background.
            Your marketing clients can authorize their own profiles without sharing agency logins.
          </p>
        </div>
      </div>

      {/* Modal: Client Invite Link */}
      {inviteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInviteModalOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border p-6 space-y-5"
            style={{ borderColor: '#D8DAD5' }}
          >
            <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: '#E8EAE6' }}>
              <div>
                <h3 className="text-base font-bold" style={{ color: '#1C2321' }}>
                  Client Social Connect Portal Link
                </h3>
                <p className="text-xs text-gray-500">
                  Send this link to your client so they can connect their accounts directly.
                </p>
              </div>
              <button
                onClick={() => setInviteModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#1C2321' }}>
                  Target Brand:
                </label>
                <select
                  value={selectedClientId === 'all' ? targetClientId : selectedClientId}
                  onChange={(e) => {
                    setSelectedClientId(e.target.value);
                    setTargetClientId(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border bg-white focus:outline-none"
                  style={{ borderColor: '#D8DAD5' }}
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (ID: {c.id.slice(0, 8)}…)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#1C2321' }}>
                  Shareable Portal URL:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    className="w-full px-3 py-2 text-xs rounded-lg border bg-gray-50 font-mono text-gray-700 select-all"
                    style={{ borderColor: '#D8DAD5' }}
                  />
                  <button
                    onClick={copyInviteLink}
                    className="px-4 py-2 text-xs font-semibold rounded-lg text-white shrink-0 transition-opacity hover:opacity-90"
                    style={{ background: '#2B6E63' }}
                  >
                    {copiedLink ? '✓ Copied!' : 'Copy Link'}
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-gray-50 border text-xs text-gray-600 space-y-1" style={{ borderColor: '#E8EAE6' }}>
                <div className="font-semibold text-gray-800">What happens when your client opens this link?</div>
                <div>1. They see an agency-branded onboarding screen for their brand.</div>
                <div>2. They click "Connect" and sign into Facebook, LinkedIn, Google, or X directly.</div>
                <div>3. Their verified pages and channels appear automatically in your dashboard.</div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: '#E8EAE6' }}>
              <a
                href={inviteLink}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 text-xs font-medium border rounded-lg hover:bg-gray-50 text-gray-700"
                style={{ borderColor: '#D8DAD5' }}
              >
                Preview Portal ↗
              </a>
              <button
                onClick={() => setInviteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg text-white"
                style={{ background: '#1C2321' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connect Account Modal */}
      {connectingPlatform && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) setConnectingPlatform(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border"
            style={{ borderColor: '#D8DAD5' }}
          >
            {/* Header */}
            <div
              className="px-6 py-5 flex items-center justify-between border-b"
              style={{ background: '#FAFAF8', borderColor: '#D8DAD5' }}
            >
              <div className="flex items-center gap-3">
                <PlatformLogo platform={connectingPlatform} size={32} />
                <div>
                  <h3 className="text-sm font-bold" style={{ color: '#1C2321' }}>
                    Connect {PLATFORM_LABELS[connectingPlatform]}
                  </h3>
                  <p className="text-xs" style={{ color: '#9A9A93' }}>
                    Link this platform to a client brand
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConnectingPlatform(null)}
                disabled={isSubmitting}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Target Client Brand Selector */}
            <div className="px-6 pt-4 pb-2 border-b" style={{ borderColor: '#E8EAE6' }}>
              <label className="block text-xs font-semibold mb-1 text-gray-700">
                Connect for Client Brand:
              </label>
              <select
                value={targetClientId}
                onChange={(e) => setTargetClientId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border bg-white focus:outline-none"
                style={{ borderColor: '#D8DAD5' }}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tabs */}
            <div className="flex border-b" style={{ borderColor: '#D8DAD5' }}>
              <button
                onClick={() => setTab('oauth')}
                className={`flex-1 py-3 text-xs font-semibold transition-colors ${tab === 'oauth' ? 'border-b-2' : 'text-gray-500 hover:text-gray-700'}`}
                style={tab === 'oauth' ? { color: '#2B6E63', borderColor: '#2B6E63' } : {}}
              >
                OAuth Login ↗
              </button>
              <button
                onClick={() => setTab('token')}
                className={`flex-1 py-3 text-xs font-semibold transition-colors ${tab === 'token' ? 'border-b-2' : 'text-gray-500 hover:text-gray-700'}`}
                style={tab === 'token' ? { color: '#2B6E63', borderColor: '#2B6E63' } : {}}
              >
                Paste Access Token
              </button>
            </div>

            {/* Tab: OAuth */}
            {tab === 'oauth' && (
              <div className="p-6 space-y-4">
                {configStatus[connectingPlatform] ? (
                  <div className="p-3.5 rounded-xl border text-xs" style={{ background: '#EBF3F1', borderColor: '#2B6E63', color: '#1C2321' }}>
                    <div className="font-semibold text-green-800 flex items-center gap-1.5 mb-1">
                      <span>✓</span> Live OAuth Integration Active
                    </div>
                    <div>
                      Connecting will redirect to the official {PLATFORM_LABELS[connectingPlatform]} authorization dialogue.
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl border text-xs space-y-2" style={{ background: '#FFFBEB', borderColor: '#F59E0B', color: '#92400E' }}>
                    <div className="font-semibold flex items-center gap-1.5">
                      <span>⚠️</span> Developer App Credentials Needed in Settings
                    </div>
                    <div className="text-[11px] leading-relaxed">
                      To connect live {PLATFORM_LABELS[connectingPlatform]} accounts via OAuth, configure your App Client ID & Secret in Settings.
                    </div>
                    {onNavigateToSettings && (
                      <button
                        type="button"
                        onClick={() => {
                          setConnectingPlatform(null);
                          onNavigateToSettings();
                        }}
                        className="text-[11px] font-semibold underline text-amber-900 block"
                      >
                        ⚙️ Configure {PLATFORM_LABELS[connectingPlatform]} Keys in Settings →
                      </button>
                    )}
                  </div>
                )}

                <p className="text-xs leading-relaxed" style={{ color: '#6A6F68' }}>
                  You will be redirected to {PLATFORM_LABELS[connectingPlatform]} to log in and approve posting access.
                  Your password is never shared — only an encrypted OAuth token.
                </p>

                <div className="space-y-2 pt-2">
                  <button
                    id={`oauth-launch-btn-${connectingPlatform}`}
                    onClick={() => handleOAuthConnect(false)}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white rounded-xl transition-opacity flex items-center justify-center gap-2 hover:opacity-95"
                    style={{ background: '#2B6E63' }}
                  >
                    🚀 Launch Real {PLATFORM_LABELS[connectingPlatform]} OAuth Login ↗
                  </button>

                  {!configStatus[connectingPlatform] && (
                    <button
                      type="button"
                      onClick={() => handleOAuthConnect(true)}
                      className="w-full py-2 px-3 text-[11px] border rounded-lg transition-colors text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1.5"
                      style={{ borderColor: '#D8DAD5' }}
                    >
                      🧪 Test Simulated Connection (Sandbox Mode)
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Manual token */}
            {tab === 'token' && (
              <form onSubmit={handleTokenConnect} className="p-6 space-y-3.5">
                <p className="text-xs text-gray-500">
                  Direct connection for agencies using long-lived page tokens from Meta Business Suite, LinkedIn Developer Portal, or Google Cloud Console.
                </p>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#1C2321' }}>
                    Access Token <span style={{ color: '#B34A3C' }}>*</span>
                  </label>
                  <input
                    type="password"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="Paste your long-lived access token"
                    required
                    className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-none"
                    style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#1C2321' }}>
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={manualDisplayName}
                    onChange={(e) => setManualDisplayName(e.target.value)}
                    placeholder={`e.g. Acme Corp ${PLATFORM_LABELS[connectingPlatform]} Page`}
                    className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-none"
                    style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#1C2321' }}>
                    External Account ID
                  </label>
                  <input
                    type="text"
                    value={manualExtId}
                    onChange={(e) => setManualExtId(e.target.value)}
                    placeholder="e.g. Page ID, Org URN, Location ID…"
                    className="w-full text-xs px-3 py-2 border rounded-lg focus:outline-none"
                    style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white rounded-xl transition-opacity hover:opacity-95"
                  style={{ background: '#2B6E63' }}
                >
                  {isSubmitting ? 'Saving & Verifying…' : `Save ${PLATFORM_LABELS[connectingPlatform]} Token`}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
