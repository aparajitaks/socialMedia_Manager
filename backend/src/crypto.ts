import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const CURRENT_VERSION = 'v1';

// Key provider with version support and strict startup validation
function getKey(version = CURRENT_VERSION): Buffer {
  const secret =
    process.env.TOKEN_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'test') {
      return crypto.createHash('sha256').update('test_fallback_token_encryption_key_vitest_only').digest();
    }
    throw new Error('FATAL: TOKEN_ENCRYPTION_KEY (or ENCRYPTION_KEY / ENCRYPTION_SECRET) environment variable is missing. Set this in your environment to run Postline securely.');
  }

  // Support future key rotation by checking versioned environment variables if present
  if (version !== CURRENT_VERSION && process.env[`TOKEN_ENCRYPTION_KEY_${version.toUpperCase()}`]) {
    return crypto.createHash('sha256').update(String(process.env[`TOKEN_ENCRYPTION_KEY_${version.toUpperCase()}`])).digest();
  }

  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypt a plaintext string (such as an OAuth access or refresh token)
 * Returns format: v1:iv:authTag:encryptedData (hex encoded)
 */
export function encryptToken(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const key = getKey(CURRENT_VERSION);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${CURRENT_VERSION}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an encrypted token.
 * Supports versioned (v1:iv:tag:data) and legacy unversioned (iv:tag:data) formats.
 * Throws on corrupted data, wrong key, or invalid ciphertext.
 */
export function decryptToken(cipherText: string): string {
  if (!cipherText) return '';

  let version = CURRENT_VERSION;
  let payload = cipherText;

  if (cipherText.startsWith('v1:')) {
    version = 'v1';
    payload = cipherText.slice(3);
  } else if (/^v\d+:/.test(cipherText)) {
    const colonIdx = cipherText.indexOf(':');
    version = cipherText.slice(0, colonIdx);
    payload = cipherText.slice(colonIdx + 1);
  }

  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Failed to decrypt token: ciphertext is malformed or invalid format');
  }

  const [ivHex, authTagHex, encryptedData] = parts;
  if (!ivHex || !authTagHex || !encryptedData) {
    throw new Error('Failed to decrypt token: missing required IV, auth tag, or ciphertext component');
  }

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = getKey(version);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    throw new Error(`Failed to decrypt token: ${err.message || 'invalid key or corrupted data'}`);
  }
}
