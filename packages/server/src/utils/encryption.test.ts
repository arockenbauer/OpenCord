import { describe, expect, it } from 'vitest';
import crypto from 'crypto';

describe('encryption utils', () => {
  const SECRET = 'test-secret-key-for-testing-purposes';

  function getKey(): Buffer {
    return crypto.createHash('sha256').update(SECRET).digest();
  }

  function encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
  }

  function decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted text');
    const iv = Buffer.from(parts[0]!, 'hex');
    const authTag = Buffer.from(parts[1]!, 'hex');
    const encrypted = Buffer.from(parts[2]!, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
  }

  function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  it('encrypts and decrypts text correctly', () => {
    const original = 'my-secret-password';
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(':');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('produces different encrypted values for same input', () => {
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

  it('hashToken returns a SHA-256 hash as hex string', () => {
    const hash = hashToken('test-token');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hashToken produces same hash for same input', () => {
    const hash1 = hashToken('token123');
    const hash2 = hashToken('token123');
    expect(hash1).toBe(hash2);
  });

  it('hashToken produces different hashes for different inputs', () => {
    const hash1 = hashToken('token1');
    const hash2 = hashToken('token2');
    expect(hash1).not.toBe(hash2);
  });
});
