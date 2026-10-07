/**
 * Credential gate — "published" must mean published.
 *
 * These tests pin the Phase 0 rule: a real adapter may never answer with a
 * fabricated post id. Missing app credentials, an empty token and a sandbox
 * token must all fail BEFORE any network call, and fake publishing must only
 * be reachable through an explicit SANDBOX_MODE opt-in.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPublisher,
  extendedPublishers,
  enableSandboxPublishing,
  restoreRealPublishers,
  SandboxPublisher,
  publishReadiness,
  CredentialsNotConfiguredError,
  AccountNeedsReconnectError,
  PlatformNotAvailableError,
} from '../publishers/index.js';
import { encryptToken } from '../crypto.js';

const ALL_CREDENTIAL_ENV_VARS = [
  'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'META_CLIENT_ID', 'META_CLIENT_SECRET', 'META_APP_ID', 'META_APP_SECRET',
  'X_API_KEY', 'X_API_SECRET',
  'PINTEREST_APP_ID', 'PINTEREST_SECRET',
  'SANDBOX_MODE',
];

const post: any = {
  id: 'post-gate',
  content: 'A caption that asks for nothing fake.',
  media_urls: ['https://cdn.example.com/image.jpg'],
};

/** Account whose access token decrypts to `token`. */
function accountWithToken(token: string, platform = 'linkedin'): any {
  return {
    id: 'acc-gate',
    platform,
    external_account_id: 'ext_123',
    access_token_encrypted: encryptToken(token),
    refresh_token_encrypted: encryptToken(token),
  };
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const name of ALL_CREDENTIAL_ENV_VARS) delete process.env[name];
  // Any adapter that tries to reach a platform API during these tests is a bug.
  fetchSpy = vi.fn(() => Promise.reject(new Error('network call attempted behind the credential gate')));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreRealPublishers();
  for (const name of ALL_CREDENTIAL_ENV_VARS) delete process.env[name];
});

describe('Credential gate: missing app credentials', () => {
  const cases: Array<[string, string]> = [
    ['linkedin', 'LINKEDIN_CLIENT_ID'],
    ['google_business', 'GOOGLE_CLIENT_ID'],
    ['facebook', 'META_CLIENT_ID'],
    ['instagram', 'META_CLIENT_ID'],
    ['x', 'X_API_KEY'],
  ];

  cases.forEach(([platform, expectedVar]) => {
    it(`${platform}: refuses with CREDENTIALS_NOT_CONFIGURED and never touches the network`, async () => {
      const publisher = getPublisher(platform as any);
      const err: any = await publisher.publish(post, accountWithToken('real-looking-token', platform)).catch((e) => e);

      expect(err).toBeInstanceOf(CredentialsNotConfiguredError);
      expect(err.code).toBe('CREDENTIALS_NOT_CONFIGURED');
      expect(err.message).toContain('not configured');
      expect(err.message).toContain(expectedVar);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it('reports an empty access token as a configuration problem', async () => {
    const publisher = getPublisher('linkedin');
    const noToken: any = { id: 'acc-empty', platform: 'linkedin', external_account_id: 'ext', access_token_encrypted: '' };
    process.env.LINKEDIN_CLIENT_ID = 'cid';
    process.env.LINKEDIN_CLIENT_SECRET = 'secret';

    const err: any = await publisher.publish(post, noToken).catch((e) => e);
    expect(err).toBeInstanceOf(CredentialsNotConfiguredError);
    expect(err.message).toMatch(/access token for linkedin account/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Credential gate: sandbox tokens need a reconnect, not a fake publish', () => {
  beforeEach(() => {
    process.env.LINKEDIN_CLIENT_ID = 'cid';
    process.env.LINKEDIN_CLIENT_SECRET = 'secret';
    process.env.META_APP_ID = 'app_id';
    process.env.META_APP_SECRET = 'app_secret';
    process.env.X_API_KEY = 'x_key';
    process.env.X_API_SECRET = 'x_secret';
  });

  it('LinkedIn refuses a mock_ access token with ACCOUNT_NEEDS_RECONNECT', async () => {
    const err: any = await getPublisher('linkedin')
      .publish(post, accountWithToken('mock_abcd123', 'linkedin'))
      .catch((e) => e);

    expect(err).toBeInstanceOf(AccountNeedsReconnectError);
    expect(err.code).toBe('ACCOUNT_NEEDS_RECONNECT');
    expect(err.message).toMatch(/reconnect/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Meta accepts the APP_ID/APP_SECRET alias, so it fails on the token and not on config', async () => {
    const err: any = await getPublisher('facebook')
      .publish(post, accountWithToken('mock_abcd123', 'facebook'))
      .catch((e) => e);

    expect(err).toBeInstanceOf(AccountNeedsReconnectError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshToken never mints a substitute token for a mock_ refresh token', async () => {
    const err: any = await getPublisher('linkedin')
      .refreshToken(accountWithToken('mock_abcd123', 'linkedin'))
      .catch((e) => e);

    expect(err).toBeInstanceOf(AccountNeedsReconnectError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('X refresh says it is unsupported instead of returning a token that looks valid', async () => {
    const err: any = await getPublisher('x')
      .refreshToken(accountWithToken('real_refresh_token', 'x'))
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/not implemented/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('X refresh asks for a reconnect when the stored token is a mock token', async () => {
    const err: any = await getPublisher('x')
      .refreshToken(accountWithToken('mock_abcd123', 'x'))
      .catch((e) => e);

    expect(err).toBeInstanceOf(AccountNeedsReconnectError);
  });
});

describe('Extended adapters: refused unless SANDBOX_MODE is opted into', () => {
  const bluesky = () => extendedPublishers.bluesky;

  it('publish and refreshToken report PLATFORM_NOT_AVAILABLE, metrics report METRICS_NOT_AVAILABLE', async () => {
    const account = accountWithToken('real-looking-token', 'bluesky');

    const publishErr: any = await bluesky()!.publish(post as any, account).catch((e) => e);
    expect(publishErr).toBeInstanceOf(PlatformNotAvailableError);
    expect(publishErr.code).toBe('PLATFORM_NOT_AVAILABLE');

    const refreshErr: any = await bluesky()!.refreshToken(account).catch((e) => e);
    expect(refreshErr).toBeInstanceOf(PlatformNotAvailableError);

    const metricsErr: any = await bluesky()!.fetchMetrics(post as any, account).catch((e) => e);
    expect(metricsErr.code).toBe('METRICS_NOT_AVAILABLE');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still enforces platform limits before the sandbox gate', async () => {
    const tooLong = { ...post, content: 'x'.repeat(400) };
    const err: any = await bluesky()!.publish(tooLong as any, accountWithToken('real', 'bluesky')).catch((e) => e);
    expect(err.message).toMatch(/validation failed/i);
    expect(err.message).toMatch(/300 characters/i);
  });

  it('publishes (clearly labelled) once SANDBOX_MODE is on', async () => {
    process.env.SANDBOX_MODE = 'true';
    const result = await bluesky()!.publish(post as any, accountWithToken('real', 'bluesky'));

    expect(result.success).toBe(true);
    expect(result.externalPostId).toMatch(/^sandbox_Bluesky_/);
    const metrics = await bluesky()!.fetchMetrics(post as any, accountWithToken('real', 'bluesky'));
    expect(metrics.impressions).toBeGreaterThan(0);
  });
});

describe('SANDBOX_MODE swaps the whole registry, and can be undone', () => {
  it('every core platform answers with a sandbox_ id in sandbox mode only', async () => {
    process.env.LINKEDIN_CLIENT_ID = 'cid';
    process.env.LINKEDIN_CLIENT_SECRET = 'secret';
    process.env.SANDBOX_MODE = 'true';
    enableSandboxPublishing();

    const linkedin = getPublisher('linkedin');
    expect(linkedin).toBeInstanceOf(SandboxPublisher);
    const result = await linkedin.publish(post as any, accountWithToken('mock_abcd123', 'linkedin'));
    expect(result.success).toBe(true);
    expect(result.externalPostId).toMatch(/^sandbox_/);
    expect(fetchSpy).not.toHaveBeenCalled();

    restoreRealPublishers();
    const restored = getPublisher('linkedin');
    expect(restored).not.toBeInstanceOf(SandboxPublisher);

    process.env.SANDBOX_MODE = 'false';
    const err: any = await restored.publish(post as any, accountWithToken('mock_abcd123', 'linkedin')).catch((e) => e);
    expect(err).toBeInstanceOf(AccountNeedsReconnectError);
  });
});

describe('publishReadiness(): the report printed at boot', () => {
  it('reports nothing as ready when no credentials are configured', () => {
    const report = publishReadiness();
    expect(report).toHaveLength(5);
    expect(report.every((entry) => !entry.ready)).toBe(true);
    expect(report.find((entry) => entry.platform === 'linkedin')!.description).toContain('LINKEDIN_CLIENT_SECRET');
  });

  it('marks only the configured platforms ready, including the Meta alias', () => {
    process.env.LINKEDIN_CLIENT_ID = 'cid';
    process.env.LINKEDIN_CLIENT_SECRET = 'secret';
    process.env.META_APP_ID = 'app_id';
    process.env.META_APP_SECRET = 'app_secret';

    const ready = publishReadiness()
      .filter((entry) => entry.ready)
      .map((entry) => entry.platform);

    expect(ready.sort()).toEqual(['facebook', 'instagram', 'linkedin']);
  });

  it('treats a half-configured pair as not ready', () => {
    process.env.LINKEDIN_CLIENT_ID = 'cid';
    expect(publishReadiness().find((entry) => entry.platform === 'linkedin')!.ready).toBe(false);
  });
});

describe('Engagement metrics are never invented outside sandbox mode', () => {
  const metricsAccount = (platform: string) => accountWithToken('real-looking-token', platform);

  it('every core adapter refuses to report engagement it did not measure', async () => {
    for (const platform of ['linkedin', 'google_business', 'facebook', 'instagram', 'x']) {
      const err: any = await getPublisher(platform as any)
        .fetchMetrics({ ...post, id: 'post-metrics', platform } as any, metricsAccount(platform))
        .catch((e) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('METRICS_NOT_AVAILABLE');
      expect(err.message).toMatch(/nothing was recorded|no real engagement metrics/i);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sandbox mode returns clearly-labelled simulated engagement', async () => {
    process.env.SANDBOX_MODE = 'true';
    for (const platform of ['linkedin', 'google_business', 'facebook', 'x']) {
      const metrics = await getPublisher(platform as any).fetchMetrics(post as any, metricsAccount(platform));
      expect(metrics.impressions).toBeGreaterThan(0);
    }
  });
});

