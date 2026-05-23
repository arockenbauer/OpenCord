import { describe, expect, it } from 'vitest';
import { encrypt, decrypt, hashToken } from './encryption.js';

describe('encryption', () => {
  it('encrypts and decrypts text correctly', () => {
    const original = 'my-secret-password';
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(':');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('produces different encrypted values for same input (due to IV)', () => {
    const text = 'same-input';
    const encrypted1 = encrypt(text);
    const encrypted2 = encrypt(text);
    expect(encrypted1).not.toBe(encrypted2);
    expect(decrypt(encrypted1)).toBe(text);
    expect(decrypt(encrypted2)).toBe(text);
  });

  it('handles empty string', () => {
    const encrypted = encrypt('');
    expect(decrypt(encrypted)).toBe('');
  });

  it('handles special characters', () => {
    const text = 'p@ssw0rd!#$%^&*()';
    const encrypted = encrypt(text);
    expect(decrypt(encrypted)).toBe(text);
  });
});

describe('hashToken', () => {
  it('returns a SHA-256 hash as hex string', () => {
    const hash = hashToken('test-token');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces same hash for same input', () => {
    const hash1 = hashToken('token123');
    const hash2 = hashToken('token123');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = hashToken('token1');
    const hash2 = hashToken('token2');
    expect(hash1).not.toBe(hash2);
  });
});
