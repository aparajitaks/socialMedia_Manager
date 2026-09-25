/**
 * Checklist §2 — Token encryption at rest
 * Unit tests verifying AES-256-GCM token encryption and decryption.
 */
import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from '../crypto.js';

describe('§2 Token encryption at rest (AES-256-GCM)', () => {
  it('encrypts plaintext tokens into non-plaintext hex string', () => {
    const secretToken = 'EAABwzLixnjYBO1mock_access_token_secret_value_12345';
    const encrypted = encryptToken(secretToken);

    // Ensure it is not stored as plaintext
    expect(encrypted).not.toBe(secretToken);
    expect(encrypted).toContain(':'); // iv:authTag:ciphertext format
    expect(encrypted.length).toBeGreaterThan(secretToken.length);
  });

  it('decrypts encrypted token back to original plaintext value', () => {
    const secretToken = 'EAABwzLixnjYBO1mock_access_token_secret_value_12345';
    const encrypted = encryptToken(secretToken);
    const decrypted = decryptToken(encrypted);

    expect(decrypted).toBe(secretToken);
  });

  it('handles null/undefined gracefully', () => {
    expect(encryptToken('')).toBe('');
    expect(decryptToken('')).toBe('');
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
