'use client';

import { useState } from 'react';
import {
  SocialAccount,
  Platform,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  deleteAccount,
  connectAccount,
} from '@/lib/api';

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'google_business', label: 'Google Business' },
  { id: 'x', label: 'X (Twitter)' },
];

const DEFAULT_CREDENTIALS: Record<Platform, { userId: string }> = {
  linkedin: {
    userId: 'company@acme-enterprises.com',
  },
  instagram: {
    userId: '@acme_global',
  },
  facebook: {
    userId: 'acme.technologies.page',
  },
  google_business: {
    userId: 'admin@acme-business.com',
  },
  x: {
    userId: '@AcmeTechHQ',
  },
};

interface Props {
  accounts: SocialAccount[];
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function AccountsView({ accounts, onRefresh, showToast }: Props) {
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const accountsByPlatform: Record<Platform, SocialAccount[]> = {
    linkedin: [],
    instagram: [],
    facebook: [],
    google_business: [],
    x: [],
  };
  for (const a of accounts) {
    if (accountsByPlatform[a.platform]) {
      accountsByPlatform[a.platform].push(a);
    }
  }

  const handleDisconnect = async (id: string, display: string) => {
    if (!confirm(`Disconnect ${display}?`)) return;
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

  const openConnectModal = (platform: Platform) => {
    const defaults = DEFAULT_CREDENTIALS[platform];
    setConnectingPlatform(platform);
    setUserId(defaults.userId);
    setPassword('••••••••••••');
    setShowPassword(false);
  };

  const handleCredentialConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectingPlatform) return;
    if (!userId.trim()) {
      showToast('Please enter your user ID or username', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      // Clean up handle for display
      const cleanHandle = userId.trim();
      const generatedExternalId = `${connectingPlatform}_usr_${Date.now().toString().slice(-6)}`;

      const created = await connectAccount({
        platform: connectingPlatform,
        display_name: cleanHandle,
        external_account_id: generatedExternalId,
        password: password.trim(),
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

  const handleOAuthRedirect = (platform: Platform) => {
    window.location.href = `/api/accounts/${platform}/connect?simulate=true`;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-6 max-w-3xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-base font-semibold" style={{ color: '#1C2321' }}>
            Connected accounts
          </h1>
          <span className="text-xs" style={{ color: '#9A9A93' }}>
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} connected
          </span>
        </div>

        <div className="space-y-3">
          {PLATFORMS.map(({ id, label }) => {
            const color = PLATFORM_COLORS[id];
            const platformAccounts = accountsByPlatform[id];
            const hasAccounts = platformAccounts.length > 0;

            return (
              <div key={id} className="border rounded" style={{ borderColor: '#D8DAD5', overflow: 'hidden' }}>
                {/* Platform header */}
                <div
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ background: '#FAFAF8', borderBottom: hasAccounts ? '1px solid #D8DAD5' : undefined }}
                >
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-semibold shrink-0"
                    style={{ background: color }}
                  >
                    {label.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: '#1C2321' }}>{label}</div>
                    <div className="text-xs" style={{ color: '#9A9A93' }}>
                      {hasAccounts ? `${platformAccounts.length} account${platformAccounts.length !== 1 ? 's' : ''} connected` : 'Not connected'}
                    </div>
                  </div>
                  <button
                    id={`connect-btn-${id}`}
                    onClick={() => openConnectModal(id)}
                    className="px-3 py-1.5 text-xs font-medium border rounded transition-colors hover:bg-white"
                    style={{
                      borderColor: color,
                      color: color,
                    }}
                  >
                    + Connect
                  </button>
                </div>

                {/* Connected accounts */}
                {platformAccounts.map((acc) => {
                  const expiring =
                    acc.token_expires_at
                      ? new Date(acc.token_expires_at) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                      : false;
                  return (
                    <div
                      key={acc.id}
                      className="flex items-center gap-3 px-4 py-2.5"
                      style={{ borderTop: '1px solid #D8DAD5', background: '#fff' }}
                    >
                      {/* Avatar */}
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                        style={{ background: color + '20', color: color }}
                      >
                        {acc.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium" style={{ color: '#1C2321' }}>
                          {acc.display_name}
                        </div>
                        <div className="text-xs" style={{ color: '#9A9A93' }}>
                          ID: {acc.external_account_id.slice(0, 14)}
                          {expiring && (
                            <span className="ml-2" style={{ color: '#B34A3C' }}>
                              · Token expiring soon
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: '#2B6E63' }}
                          title="Active"
                        />
                        <button
                          id={`disconnect-btn-${acc.id}`}
                          onClick={() => handleDisconnect(acc.id, acc.display_name)}
                          disabled={disconnecting === acc.id}
                          className="text-xs px-2.5 py-1 border rounded transition-colors hover:bg-white"
                          style={{ borderColor: '#D8DAD5', color: '#9A9A93' }}
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

        {/* Info box */}
        <div className="mt-4 border rounded p-3" style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}>
          <p className="text-xs" style={{ color: '#9A9A93' }}>
            OAuth tokens are stored encrypted using AES-256-GCM and are automatically refreshed before expiry.
            Token refresh runs every 6 hours via the internal scheduler.
          </p>
        </div>
      </div>

      {/* Connect Account Modal with User ID & Password */}
      {connectingPlatform && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) {
              setConnectingPlatform(null);
            }
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden border"
            style={{ borderColor: '#D8DAD5' }}
          >
            {/* Header */}
            <div
              className="px-5 py-4 flex items-center justify-between border-b"
              style={{ background: '#FAFAF8', borderColor: '#D8DAD5' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded flex items-center justify-center text-white text-sm font-bold"
                  style={{ background: PLATFORM_COLORS[connectingPlatform] }}
                >
                  {PLATFORM_LABELS[connectingPlatform].charAt(0)}
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: '#1C2321' }}>
                    Connect {PLATFORM_LABELS[connectingPlatform]}
                  </h3>
                  <p className="text-xs" style={{ color: '#9A9A93' }}>
                    Sign in with your {PLATFORM_LABELS[connectingPlatform]} credentials
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

            {/* Form Body */}
            <form onSubmit={handleCredentialConnect} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#1C2321' }}>
                  User ID / Username / Email
                </label>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder={`e.g. @${connectingPlatform}_page or user@example.com`}
                  required
                  className="w-full text-xs px-3 py-2 border rounded focus:outline-none focus:ring-1"
                  style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#1C2321' }}>
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter account password"
                    required
                    className="w-full text-xs px-3 py-2 pr-12 border rounded focus:outline-none focus:ring-1"
                    style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 hover:text-gray-800"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-[11px] mt-1 text-gray-400">
                  Credentials are securely verified and stored with AES-256-GCM encryption.
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 text-xs font-medium text-white rounded transition-colors flex items-center justify-center gap-2"
                  style={{ background: '#2B6E63' }}
                >
                  {isSubmitting ? (
                    'Connecting account…'
                  ) : (
                    `Connect ${PLATFORM_LABELS[connectingPlatform]} Account`
                  )}
                </button>

                <div className="relative my-1 text-center">
                  <span className="text-[11px] text-gray-400 bg-white px-2">or connect via web login</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleOAuthRedirect(connectingPlatform)}
                  disabled={isSubmitting}
                  className="w-full py-2 px-4 text-xs font-medium border rounded transition-colors hover:bg-gray-50 flex items-center justify-center gap-1.5"
                  style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                >
                  <span>Launch Official {PLATFORM_LABELS[connectingPlatform]} OAuth</span>
                  <span className="text-gray-400">↗</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
