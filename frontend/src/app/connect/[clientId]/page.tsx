'use client';

import { useState, useEffect, use } from 'react';
import {
  Platform,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  SocialAccount,
  fetchAccounts,
  deleteAccount,
  verifyAccount,
} from '@/lib/api';
import PlatformLogo from '@/components/PlatformLogo';

interface PageProps {
  params: Promise<{ clientId: string }>;
}

const PLATFORMS: { id: Platform; label: string; desc: string; icon: string }[] = [
  {
    id: 'facebook',
    label: 'Facebook Page',
    desc: 'Grant permissions to publish posts and view page engagement.',
    icon: '📘',
  },
  {
    id: 'instagram',
    label: 'Instagram Business',
    desc: 'Publish photos, carousels, and stories to your Instagram business account.',
    icon: '📸',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Company Page',
    desc: 'Publish updates, articles, and track impressions on your LinkedIn organization.',
    icon: '💼',
  },
  {
    id: 'google_business',
    label: 'Google Business Profile',
    desc: 'Post updates, announcements, and local offers to Google Search and Maps.',
    icon: '🏪',
  },
  {
    id: 'x',
    label: 'X (Twitter)',
    desc: 'Publish tweets, threads, and track post analytics.',
    icon: '✖️',
  },
];

export default function ClientConnectPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const clientId = resolvedParams.clientId;

  const [clientName, setClientName] = useState<string>('Client Brand');
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const loadData = async () => {
    try {
      // 1. Fetch client brand details
      const clientsRes = await fetch('/api/clients');
      if (clientsRes.ok) {
        const clients = await clientsRes.json();
        const found = clients.find((c: any) => c.id === clientId);
        if (found) setClientName(found.name);
      }

      // 2. Fetch accounts connected for this client
      const accs = await fetchAccounts(clientId);
      setAccounts(accs);
    } catch (err: any) {
      console.error('Failed to load portal data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Check URL query for connection results
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      const connected = search.get('connected');
      const err = search.get('error');
      if (connected) {
        showToast(`✓ Successfully connected ${connected.toUpperCase()} to your brand!`);
        window.history.replaceState({}, '', window.location.pathname);
      } else if (err) {
        showToast(`Connection notice: ${decodeURIComponent(err)}`, 'error');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [clientId]);

  const handleConnect = (platform: Platform) => {
    window.location.href = `/api/clients/${clientId}/social/${platform}/connect?returnTo=${encodeURIComponent(`/connect/${clientId}`)}`;
  };

  const handleVerify = async (accId: string, name: string) => {
    setVerifyingId(accId);
    try {
      const res = await verifyAccount(accId);
      showToast(`✓ Live Verified: ${res.message}`);
      loadData();
    } catch (err: any) {
      showToast(`Verification failed: ${err.message}`, 'error');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDisconnect = async (id: string, name: string) => {
    if (!confirm(`Disconnect "${name}" from your agency workspace?`)) return;
    try {
      await deleteAccount(id);
      showToast(`${name} disconnected`);
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-4 sm:p-8" style={{ background: '#F4F5F2' }}>
      {/* Toast Notification */}
      {toast && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg shadow-xl text-xs font-medium flex items-center gap-2 animate-bounce border"
          style={{
            background: toast.type === 'error' ? '#FFF5F5' : '#EBF3F1',
            borderColor: toast.type === 'error' ? '#B34A3C' : '#2B6E63',
            color: toast.type === 'error' ? '#B34A3C' : '#2B6E63',
          }}
        >
          <span>{toast.type === 'error' ? '⚠️' : '🎉'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border p-6 sm:p-10 space-y-8" style={{ borderColor: '#D8DAD5' }}>
        {/* Header */}
        <div className="text-center space-y-2 border-b pb-6" style={{ borderColor: '#E8EAE6' }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#EBF3F1', color: '#2B6E63' }}>
            <span>🏢</span> Agency Client Connect Portal
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#1C2321' }}>
            Connect Accounts for {clientName}
          </h1>
          <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
            Your digital marketing agency has requested access to manage your social channels.
            Authorize your pages below to enable automated publishing, scheduled campaigns, and performance tracking.
          </p>
        </div>

        {/* Security / Privacy Guarantee */}
        <div className="p-4 rounded-xl text-xs space-y-2" style={{ background: '#FAFAF8', border: '1px solid #E8EAE6' }}>
          <div className="font-semibold text-gray-800 flex items-center gap-2">
            <span>🔒</span> Bank-Grade OAuth 2.0 Security
          </div>
          <ul className="text-[11px] text-gray-600 space-y-1 list-disc list-inside">
            <li>You will sign into the official provider dialogue (Meta, Google, LinkedIn).</li>
            <li>Your account passwords are <strong>never</strong> seen, requested, or stored.</li>
            <li>Access tokens are encrypted with AES-256-GCM and can be revoked at any time.</li>
          </ul>
        </div>

        {/* Platform Grid */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
            Social Channels
          </h2>

          {loading ? (
            <div className="py-12 text-center text-xs text-gray-400">Loading channel status…</div>
          ) : (
            PLATFORMS.map((p) => {
              const connected = accounts.filter((a) => a.platform === p.id);
              const isConnected = connected.length > 0;
              const color = PLATFORM_COLORS[p.id];

              return (
                <div
                  key={p.id}
                  className="p-4 rounded-xl border transition-all hover:shadow-sm"
                  style={{ borderColor: isConnected ? '#2B6E63' : '#D8DAD5', background: isConnected ? '#FCFDFC' : '#fff' }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <PlatformLogo platform={p.id} size={36} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
                            {p.label}
                          </h3>
                          {isConnected && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                              ✓ Connected
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate max-w-sm">{p.desc}</p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <button
                        onClick={() => handleConnect(p.id)}
                        className="px-4 py-2 text-xs font-semibold rounded-lg text-white transition-opacity hover:opacity-90 flex items-center gap-1.5"
                        style={{ background: isConnected ? '#1C2321' : color }}
                      >
                        <span>{isConnected ? '+ Add Another' : 'Connect ↗'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Connected Accounts for this channel */}
                  {isConnected && (
                    <div className="mt-4 pt-3 border-t space-y-2" style={{ borderColor: '#E8EAE6' }}>
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                        Active Profiles:
                      </span>
                      {connected.map((acc) => (
                        <div
                          key={acc.id}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border text-xs"
                          style={{ borderColor: '#E8EAE6' }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                            <span className="font-medium text-gray-800 truncate">{acc.display_name}</span>
                            <span className="text-[10px] text-gray-400 truncate">ID: {acc.external_account_id}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleVerify(acc.id, acc.display_name)}
                              disabled={verifyingId === acc.id}
                              className="text-[11px] px-2 py-1 rounded border text-gray-700 hover:bg-white transition-colors"
                              style={{ borderColor: '#D8DAD5' }}
                            >
                              {verifyingId === acc.id ? 'Verifying…' : '⚡ Test Connection'}
                            </button>
                            <button
                              onClick={() => handleDisconnect(acc.id, acc.display_name)}
                              className="text-[11px] px-2 py-1 rounded text-red-600 hover:bg-red-50 transition-colors"
                            >
                              Disconnect
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-6 border-t text-center text-xs text-gray-400" style={{ borderColor: '#E8EAE6' }}>
          Protected by Postline Social Media Suite for Digital Marketing Agencies
        </div>
      </div>
    </div>
  );
}
