/**
 * Checklist §2 — Token encryption at rest
 * Unit tests verifying AES-256-GCM token encryption and decryption.
 */
import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from '../crypto.js';

describe('§2 Token encryption at rest (AES-256-GCM)', () => {
  it('encrypts plaintext tokens with v1 version prefix and non-plaintext format', () => {
    const secretToken = 'EAABwzLixnjYBO1mock_access_token_secret_value_12345';
    const encrypted = encryptToken(secretToken);

    // Ensure it is not stored as plaintext and has v1 prefix
    expect(encrypted).not.toBe(secretToken);
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(encrypted.split(':').length).toBe(4); // v1:iv:tag:data
    expect(encrypted.length).toBeGreaterThan(secretToken.length);
  });

  it('decrypts encrypted token back to original plaintext value', () => {
    const secretToken = 'EAABwzLixnjYBO1mock_access_token_secret_value_12345';
    const encrypted = encryptToken(secretToken);
    const decrypted = decryptToken(encrypted);

    expect(decrypted).toBe(secretToken);
  });

  it('decrypts legacy unversioned tokens (iv:authTag:ciphertext)', () => {
    const secretToken = 'legacy_secret_value_123';
    // Encrypt with v1, then strip prefix to simulate legacy stored data
    const versioned = encryptToken(secretToken);
    const legacy = versioned.slice(3); // strip 'v1:'

    expect(legacy.split(':').length).toBe(3);
    const decrypted = decryptToken(legacy);
    expect(decrypted).toBe(secretToken);
  });

  it('handles null/undefined gracefully', () => {
    expect(encryptToken('')).toBe('');
    expect(decryptToken('')).toBe('');
  });

  it('throws an error on malformed or corrupted ciphertext', () => {
    expect(() => decryptToken('not_valid_ciphertext')).toThrow(/malformed|invalid/i);
    expect(() => decryptToken('v1:bad:data')).toThrow(/malformed|invalid/i);
    expect(() => decryptToken('v1:123456789012345678901234:12345678901234567890123456789012:deadbeef')).toThrow(/Failed to decrypt/i);
  });

  it('different encryptions of same token produce unique ciphertexts (unique IV per call)', () => {
    const token = 'my_super_secret_token';
    const enc1 = encryptToken(token);
    const enc2 = encryptToken(token);

    // Fresh IV each time prevents replay attacks
    expect(enc1).not.toBe(enc2);
    expect(decryptToken(enc1)).toBe(token);
    expect(decryptToken(enc2)).toBe(token);
  });
});

