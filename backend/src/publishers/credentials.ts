/**
 * Central credential gate — Phase 0 rule: "no mocks in production code".
 *
 * Every real platform adapter MUST call requireLiveCredentials() and
 * requireRealAccessToken() before touching the network. Previously each
 * adapter had an `if (isLive) { …real API… }` block that silently fell through
 * to a fabricated `success: true` result, so a post could be marked `published`
 * with a made-up platform_post_id while nothing ever reached the platform.
 *
 * Fabricated publishing is now only possible when the operator explicitly opts
 * in with SANDBOX_MODE=true (see publishers/sandbox.ts). NODE_ENV alone never
 * enables it, so a deployment that forgets to set NODE_ENV=production is still
 * safe: it fails loudly instead of publishing air.
 */

export const SANDBOX_TOKEN_PREFIXES = ['mock_', 'sandbox_', 'test_token_'];

/** Thrown when the platform's OAuth app credentials are absent from the environment. */
export class CredentialsNotConfiguredError extends Error {
  readonly code = 'CREDENTIALS_NOT_CONFIGURED';
  readonly missing: string[];

  constructor(platform: string, missing: string[]) {
    super(
      `Publishing to ${platform} is not configured: missing environment variable(s): ${missing.join(', ')}. ` +
        `Add them to .env.local (see .env.example) or reconnect the account.`
    );
    this.name = 'CredentialsNotConfiguredError';
    this.missing = missing;
  }
}

/** Thrown when an account was connected in sandbox mode and cannot be published to for real. */
export class AccountNeedsReconnectError extends Error {
  readonly code = 'ACCOUNT_NEEDS_RECONNECT';

  constructor(platform: string) {
    super(
      `The ${platform} account is connected with a sandbox/demo token, so it cannot publish for real. ` +
        `Reconnect the account through the real OAuth flow.`
    );
    this.name = 'AccountNeedsReconnectError';
  }
}

/** Thrown for platforms that are not wired to a real API yet, unless sandbox mode is on. */
export class PlatformNotAvailableError extends Error {
  readonly code = 'PLATFORM_NOT_AVAILABLE';

  constructor(platform: string) {
    super(
      `Automatic publishing to ${platform} is not available yet: this build has no live ${platform} API integration. ` +
        `Set SANDBOX_MODE=true only where fake publishing is intended.`
    );
    this.name = 'PlatformNotAvailableError';
  }
}
/**
 * Thrown when an adapter has no honest way to report engagement. Recording
 * invented impressions as if they were measured is the same class of bug as a
 * fake post id, so this is a separate code the sync loop can recognise.
 */
export class MetricsNotAvailableError extends Error {
  readonly code = 'METRICS_NOT_AVAILABLE';

  constructor(platform: string) {
    super(
      `No real engagement metrics exist for ${platform} in this build, so nothing was recorded. ` +
        `Set SANDBOX_MODE=true only where simulated numbers are intended.`
    );
    this.name = 'MetricsNotAvailableError';
  }
}

/** Guard for engagement reporting: simulated numbers only in sandbox mode. */
export function requireRealMetrics(platform: string): void {
  if (!isSandboxMode()) {
    throw new MetricsNotAvailableError(platform);
  }
}


/**
 * Explicit, operator-controlled opt-in for fake publishing.
 * Deliberately NOT tied to NODE_ENV — a stray NODE_ENV must never turn
 * "published" into a lie.
 */
export function isSandboxMode(): boolean {
  return process.env.SANDBOX_MODE === 'true' || process.env.SANDBOX_MODE === '1';
}

/** True when every named env var is present and non-empty. */
export function hasLiveCredentials(envVars: string[]): boolean {
  return missingCredentials(envVars).length === 0;
}

export function missingCredentials(envVars: string[]): string[] {
  return envVars.filter((name) => !process.env[name] || String(process.env[name]).trim() === '');
}

/**
 * Throw unless the platform's app credentials are configured.
 * Returns the resolved values so callers do not re-read process.env.
 */
export function requireLiveCredentials(platform: string, envVars: string[]): Record<string, string> {
  const missing = missingCredentials(envVars);
  if (missing.length > 0) {
    throw new CredentialsNotConfiguredError(platform, missing);
  }
  const resolved: Record<string, string> = {};
  for (const name of envVars) resolved[name] = String(process.env[name]);
  return resolved;
}

/**
 * Credential groups the platform accepts, e.g. Meta accepts either
 * META_APP_ID or META_CLIENT_ID. Resolves to the first set that is complete.
 */
export interface ResolvedCredentials {
  values: Record<string, string>;
  envName: string;
}

export function resolveCredentialAlternatives(groups: string[][]): ResolvedCredentials | null {
  for (const group of groups) {
    const values: Record<string, string> = {};
    let complete = true;
    for (const name of group) {
      const value = process.env[name];
      if (!value || String(value).trim() === '') {
        complete = false;
        break;
      }
      values[name] = String(value);
    }
    if (complete) return { values, envName: group[0] };
  }
  return null;
}

/**
 * Throw unless at least one complete credential group is configured.
 * `description` names the group in the error, e.g. "META_APP_ID or META_CLIENT_ID".
 */
export function requireCredentialAlternatives(platform: string, groups: string[][], description: string): ResolvedCredentials {
  const resolved = resolveCredentialAlternatives(groups);
  if (!resolved) {
    throw new CredentialsNotConfiguredError(platform, [description]);
  }
  return resolved;
}

export function isSandboxAccessToken(token: string | null | undefined): boolean {
  if (!token) return false;
  return SANDBOX_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix));
}

/**
 * Throw unless we hold a token that could plausibly work against the real API.
 * An empty token is a configuration problem; a `mock_…` token is an account
 * that must be reconnected.
 */
export function requireRealAccessToken(platform: string, token: string | null | undefined): string {
  if (!token || token.trim() === '') {
    throw new CredentialsNotConfiguredError(platform, [`access token for ${platform} account`]);
  }
  if (!isSandboxMode() && isSandboxAccessToken(token)) {
    throw new AccountNeedsReconnectError(platform);
  }
  return token;
}

/** Guard for the test-only failure hooks ([TRIGGER_FAIL], invalid_token, …). */
export function sandboxFailureHook(active: boolean, message: string): void {
  if (active && isSandboxMode()) {
    throw new Error(message);
  }
}

/**
 * Guard for adapters that have no live API implementation yet. In sandbox mode
 * the caller may fabricate a result; otherwise publishing is refused.
 */
export function requireSandboxMode(platform: string): void {
  if (!isSandboxMode()) {
    throw new PlatformNotAvailableError(platform);
  }
}

/** Small helper so the sandbox fake-publish path stays identical everywhere. */
export async function sandboxDelay(ms = 150): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Id scheme used by every sandbox/simulated publisher. Always prefixed so a
 * fabricated id can never be mistaken for a real platform id in the DB.
 */
export function sandboxPublishId(prefix: string): string {
  return `sandbox_${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// ---------------------------------------------------------------------------
// Boot-time readiness report
// ---------------------------------------------------------------------------

export interface PlatformCredentialRequirement {
  platform: string;
  /** Any one complete group is enough to publish for real. */
  groups: string[][];
  description: string;
}

/**
 * What each core adapter needs to publish for real. Used for the startup
 * report only — the adapters themselves still guard every call, so this list
 * can never be used to bypass a gate.
 */
export const PUBLISH_CREDENTIAL_REQUIREMENTS: PlatformCredentialRequirement[] = [
  {
    platform: 'linkedin',
    groups: [['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET']],
    description: 'LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET',
  },
  {
    platform: 'google_business',
    groups: [['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']],
    description: 'GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET',
  },
  {
    platform: 'facebook',
    groups: [['META_CLIENT_ID', 'META_CLIENT_SECRET'], ['META_APP_ID', 'META_APP_SECRET']],
    description: 'META_CLIENT_ID + META_CLIENT_SECRET (or META_APP_ID + META_APP_SECRET)',
  },
  {
    platform: 'instagram',
    groups: [['META_CLIENT_ID', 'META_CLIENT_SECRET'], ['META_APP_ID', 'META_APP_SECRET']],
    description: 'META_CLIENT_ID + META_CLIENT_SECRET (or META_APP_ID + META_APP_SECRET)',
  },
  {
    platform: 'x',
    groups: [['X_API_KEY', 'X_API_SECRET']],
    description: 'X_API_KEY + X_API_SECRET',
  },
];

export interface PlatformReadiness {
  platform: string;
  ready: boolean;
  description: string;
}

/** Which platforms can actually publish in this process right now. */
export function publishReadiness(): PlatformReadiness[] {
  return PUBLISH_CREDENTIAL_REQUIREMENTS.map((req) => ({
    platform: req.platform,
    ready: req.groups.some((group) => hasLiveCredentials(group)),
    description: req.description,
  }));
}
