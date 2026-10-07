'use client';

import { useState, useEffect } from 'react';

interface PlatformConfig {
  configured: boolean;
  redirect_uri?: string;
  docs_url?: string;
  [key: string]: any;
}

interface OAuthConfig {
  linkedin: PlatformConfig;
  facebook: PlatformConfig;
  google_business: PlatformConfig;
  x: PlatformConfig;
  app_url?: string;
}

interface Props {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

const PLATFORM_META = {
  linkedin: {
    label: 'LinkedIn',
    color: '#0A66C2',
    bg: '#EBF2FA',
    icon: '💼',
    docs_url: 'https://www.linkedin.com/developers/apps',
    fields: [
      { key: 'linkedin_client_id', label: 'Client ID', placeholder: 'e.g. 77xxxxx', secret: false },
      { key: 'linkedin_client_secret', label: 'Client Secret', placeholder: 'Paste your secret…', secret: true },
    ],
    steps: [
      'Go to LinkedIn Developer Apps',
      'Create or select your app',
      'Under "Products" → request "Share on LinkedIn" and "Sign In with LinkedIn"',
      'Go to Auth tab → copy "Client ID" and "Primary Client Secret"',
      'Add the Redirect URL shown below to "Authorized redirect URLs for your app"',
    ],
  },
  facebook: {
    label: 'Facebook & Instagram',
    color: '#1877F2',
    bg: '#EBF2FA',
    icon: '📘',
    docs_url: 'https://developers.facebook.com/apps',
    fields: [
      { key: 'meta_app_id', label: 'App ID', placeholder: 'e.g. 123456789012345', secret: false },
      { key: 'meta_app_secret', label: 'App Secret', placeholder: 'Paste your secret…', secret: true },
    ],
    steps: [
      'Go to Meta for Developers → My Apps',
      'Create or select your Business app',
      'Under App Settings → Basic, copy "App ID" and "App Secret"',
      'Enable Products: Facebook Login and Instagram Graph API',
      'Add the Redirect URL below to: Facebook Login → Valid OAuth Redirect URIs',
      'Note: Instagram uses the same credentials — one app covers both',
    ],
  },
  google_business: {
    label: 'Google Business Profile',
    color: '#4285F4',
    bg: '#EBF2FA',
    icon: '🏪',
    docs_url: 'https://console.cloud.google.com/apis/credentials',
    fields: [
      { key: 'google_client_id', label: 'Client ID', placeholder: 'e.g. xxxx.apps.googleusercontent.com', secret: false },
      { key: 'google_client_secret', label: 'Client Secret', placeholder: 'Paste your secret…', secret: true },
    ],
    steps: [
      'Open Google Cloud Console → APIs & Services → Credentials',
      'Create OAuth 2.0 Client ID (type: Web Application)',
      'Under "Authorized redirect URIs" add the URI shown below',
      'Enable "My Business API" or "Business Profile Performance API" from Library',
      'Copy Client ID and Client Secret here',
    ],
  },
  x: {
    label: 'X (Twitter)',
    color: '#000000',
    bg: '#F0F0F0',
    icon: '✖️',
    docs_url: 'https://developer.twitter.com/en/portal/dashboard',
    fields: [
      { key: 'x_api_key', label: 'API Key (Client ID)', placeholder: 'e.g. xxxxxxxxxxx', secret: false },
      { key: 'x_api_secret', label: 'API Secret (Client Secret)', placeholder: 'Paste your secret…', secret: true },
    ],
    steps: [
      'Go to Twitter Developer Portal → Projects & Apps',
      'Create a new App with "OAuth 2.0" enabled',
      'Set App Type to "Web App, Automated App or Bot"',
      'Under "User authentication settings" → add the Redirect URI below',
      'Set permissions to: "Read and Write"',
      'Copy your API Key and API Key Secret from "Keys and Tokens" tab',
    ],
  },
};

type Platform = keyof typeof PLATFORM_META;

export default function SettingsView({ showToast }: Props) {
  const [config, setConfig] = useState<OAuthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPlatform, setExpandedPlatform] = useState<Platform | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState<Platform | null>(null);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/settings/oauth');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error('Failed to load OAuth config', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfig(); }, []);

  const handleSave = async (platform: Platform) => {
    const meta = PLATFORM_META[platform];
    const payload: Record<string, string> = {};
    for (const field of meta.fields) {
      const val = formData[field.key];
      if (val && val.trim()) payload[field.key] = val.trim();
    }
    if (Object.keys(payload).length === 0) {
      showToast('Please fill in at least one field before saving', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/settings/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      showToast(`✅ ${meta.label} credentials saved — OAuth is now live!`);
      setFormData((prev) => {
        const next = { ...prev };
        for (const field of meta.fields) delete next[field.key];
        return next;
      });
      setExpandedPlatform(null);
      await fetchConfig();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const platforms = Object.keys(PLATFORM_META) as Platform[];

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-6 max-w-2xl">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-base font-semibold mb-1" style={{ color: '#1C2321' }}>
            OAuth Integration Settings
          </h1>
          <p className="text-xs" style={{ color: '#9A9A93' }}>
            Enter your social platform developer credentials here. Each client that clicks "Connect" will go through
            real OAuth authentication — their account will be securely linked without sharing passwords.
          </p>
        </div>

        {/* App URL */}
        <div className="mb-5 p-4 rounded border" style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: '#1C2321' }}>⚙️ App Base URL</span>
            <span className="text-[11px] font-mono" style={{ color: '#9A9A93' }}>
              {config?.app_url || 'http://localhost:3000'}
            </span>
          </div>
          <p className="text-[11px]" style={{ color: '#9A9A93' }}>
            This is used to build OAuth redirect URIs. For production, change NEXT_PUBLIC_APP_URL in .env.local to your domain (e.g. <code>https://yourapp.com</code>).
          </p>
        </div>

        {/* Platform Cards */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-xs text-center py-8" style={{ color: '#9A9A93' }}>Loading configuration…</div>
          ) : (
            platforms.map((platform) => {
              const meta = PLATFORM_META[platform];
              const status = config?.[platform];
              const isConfigured = status?.configured;
              const isOpen = expandedPlatform === platform;
              const guideOpen = showGuide === platform;
              const redirectUri = status?.redirect_uri;

              return (
                <div
                  key={platform}
                  className="border rounded overflow-hidden"
                  style={{ borderColor: isConfigured ? '#2B6E63' : '#D8DAD5' }}
                >
                  {/* Platform row */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                    style={{ background: isConfigured ? '#EBF3F1' : '#FAFAF8' }}
                    onClick={() => setExpandedPlatform(isOpen ? null : platform)}
                  >
                    <span className="text-lg">{meta.icon}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: '#1C2321' }}>{meta.label}</div>
                      <div className="text-[11px]" style={{ color: '#9A9A93' }}>
                        {isConfigured ? '✓ Live — clients can connect via real OAuth' : '○ Credentials not configured'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{
                          background: isConfigured ? '#2B6E63' : '#D8DAD5',
                          color: isConfigured ? '#fff' : '#9A9A93',
                        }}
                      >
                        {isConfigured ? 'Live' : 'Setup needed'}
                      </span>
                      <span className="text-xs" style={{ color: '#9A9A93' }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded setup panel */}
                  {isOpen && (
                    <div className="border-t px-4 py-4 space-y-4" style={{ borderColor: '#D8DAD5', background: '#fff' }}>
                      {/* Redirect URI */}
                      {redirectUri && (
                        <div>
                          <label className="block text-[11px] font-semibold mb-1" style={{ color: '#9A9A93' }}>
                            REDIRECT URI — copy this into your developer app
                          </label>
                          <div
                            className="flex items-center gap-2 px-3 py-2 rounded border font-mono text-[11px] break-all"
                            style={{ borderColor: '#D8DAD5', background: '#F4F5F2', color: '#1C2321' }}
                          >
                            <span className="flex-1">{redirectUri}</span>
                            <button
                              className="text-xs px-2 py-0.5 rounded border shrink-0"
                              style={{ borderColor: '#D8DAD5', color: '#2B6E63' }}
                              onClick={() => {
                                navigator.clipboard.writeText(redirectUri);
                                showToast('Redirect URI copied!');
                              }}
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Credential fields */}
                      <div className="space-y-3">
                        {meta.fields.map((field) => (
                          <div key={field.key}>
                            <label className="block text-xs font-medium mb-1" style={{ color: '#1C2321' }}>
                              {field.label}
                              {status?.[field.key.replace(/_/g, '_') + '_set'] || status?.configured
                                ? <span className="ml-2 text-[11px] font-normal" style={{ color: '#2B6E63' }}>✓ Already set</span>
                                : <span className="ml-2 text-[11px] font-normal" style={{ color: '#9A9A93' }}>Not yet configured</span>
                              }
                            </label>
                            <input
                              type={field.secret ? 'password' : 'text'}
                              value={formData[field.key] || ''}
                              onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                              placeholder={field.secret ? '(leave blank to keep existing)' : field.placeholder}
                              className="w-full text-xs px-3 py-2 border rounded focus:outline-none"
                              style={{ borderColor: '#D8DAD5', color: '#1C2321' }}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Setup guide toggle */}
                      <button
                        className="text-xs underline"
                        style={{ color: '#2B6E63' }}
                        onClick={() => setShowGuide(guideOpen ? null : platform)}
                      >
                        {guideOpen ? '▲ Hide step-by-step setup guide' : '▼ Show step-by-step setup guide'}
                      </button>

                      {guideOpen && (
                        <div className="rounded p-3 text-xs space-y-1.5" style={{ background: '#F4F5F2', color: '#1C2321' }}>
                          <div className="font-semibold mb-2">
                            Setup guide:&nbsp;
                            <a href={meta.docs_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2B6E63' }}>
                              Open {meta.label} Developer Console ↗
                            </a>
                          </div>
                          {meta.steps.map((step, i) => (
                            <div key={i} className="flex gap-2">
                              <span className="shrink-0 font-mono font-bold" style={{ color: '#9A9A93' }}>{i + 1}.</span>
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Save button */}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleSave(platform)}
                          disabled={saving}
                          className="flex-1 py-2 text-xs font-medium text-white rounded"
                          style={{ background: '#2B6E63', opacity: saving ? 0.6 : 1 }}
                        >
                          {saving ? 'Saving…' : `Save ${meta.label} Credentials`}
                        </button>
                        <button
                          onClick={() => setExpandedPlatform(null)}
                          className="px-3 py-2 text-xs border rounded"
                          style={{ borderColor: '#D8DAD5', color: '#9A9A93' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Info footer */}
        <div className="mt-6 p-4 rounded border text-xs space-y-2" style={{ borderColor: '#D8DAD5', background: '#FAFAF8' }}>
          <div className="font-semibold" style={{ color: '#1C2321' }}>🔐 How it works</div>
          <div style={{ color: '#9A9A93' }}>
            Credentials are saved to <code>.env.local</code> and loaded live into the server process — no restart needed.
            When a client clicks "Connect Account", they are redirected to the platform's official OAuth page, log in there,
            and are sent back. Their access token is encrypted with AES-256-GCM before being stored.
          </div>
          <div style={{ color: '#9A9A93' }}>
            These credentials are <strong>your agency developer app keys</strong>, not your clients' passwords.
            One set of keys enables unlimited clients to connect their own accounts.
          </div>
        </div>
      </div>
    </div>
  );
}
