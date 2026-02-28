import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, deriveKey } from '../../src/storage/crypto';

describe('crypto', () => {
  describe('deriveKey', () => {
    it('derives a CryptoKey from a passphrase and salt', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey('test-passphrase', salt);
      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
      expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    });

    it('derives the same key for the same passphrase and salt', async () => {
      const salt = new Uint8Array(16).fill(42);
      const key1 = await deriveKey('same-pass', salt);
      const key2 = await deriveKey('same-pass', salt);

      // Export raw bytes to compare (keys themselves aren't extractable,
      // but we can test encrypt/decrypt consistency instead)
      const data = 'test data';
      const iv = new Uint8Array(12).fill(1);

      const enc1 = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key1,
        new TextEncoder().encode(data).buffer as ArrayBuffer
      );
      const enc2 = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key2,
        new TextEncoder().encode(data).buffer as ArrayBuffer
      );

      expect(new Uint8Array(enc1)).toEqual(new Uint8Array(enc2));
    });

    it('derives different keys for different passphrases', async () => {
      const salt = new Uint8Array(16).fill(7);
      const key1 = await deriveKey('pass-a', salt);
      const key2 = await deriveKey('pass-b', salt);

      const data = 'test data';
      const iv = new Uint8Array(12).fill(1);

      const enc1 = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key1,
        new TextEncoder().encode(data).buffer as ArrayBuffer
      );
      const enc2 = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key2,
        new TextEncoder().encode(data).buffer as ArrayBuffer
      );

      expect(new Uint8Array(enc1)).not.toEqual(new Uint8Array(enc2));
    });
  });

  describe('encrypt / decrypt round-trip', () => {
    it('encrypts and decrypts a simple string', async () => {
      const passphrase = 'my-secret-passphrase';
      const plaintext = 'Hello, World!';

      const encrypted = await encrypt(plaintext, passphrase);
      expect(encrypted).toBeInstanceOf(ArrayBuffer);
      // salt (16) + iv (12) + ciphertext (>= plaintext length)
      expect(encrypted.byteLength).toBeGreaterThan(28);

      const decrypted = await decrypt(encrypted, passphrase);
      expect(decrypted).toBe(plaintext);
    });

    it('handles a JSON profile payload', async () => {
      const passphrase = 'strong-password-123!';
      const profile = JSON.stringify({
        personal: { firstName: 'Jane', lastName: 'Smith' },
        address: { suburb: 'Bondi', postcode: '2026' },
      });

      const encrypted = await encrypt(profile, passphrase);
      const decrypted = await decrypt(encrypted, passphrase);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(profile));
    });

    it('handles empty string', async () => {
      const encrypted = await encrypt('', 'pass');
      const decrypted = await decrypt(encrypted, 'pass');
      expect(decrypted).toBe('');
    });

    it('handles unicode characters', async () => {
      const text = 'Straße München 日本語 emoji 🏠';
      const encrypted = await encrypt(text, 'pass');
      const decrypted = await decrypt(encrypted, 'pass');
      expect(decrypted).toBe(text);
    });

    it('produces different ciphertext on each call (random salt/iv)', async () => {
      const passphrase = 'same-pass';
      const plaintext = 'same-plaintext';

      const enc1 = await encrypt(plaintext, passphrase);
      const enc2 = await encrypt(plaintext, passphrase);

      expect(new Uint8Array(enc1)).not.toEqual(new Uint8Array(enc2));
    });

    it('fails to decrypt with wrong passphrase', async () => {
      const encrypted = await encrypt('secret', 'correct-pass');
      await expect(decrypt(encrypted, 'wrong-pass')).rejects.toThrow();
    });

    it('fails to decrypt tampered ciphertext', async () => {
      const encrypted = await encrypt('data', 'pass');
      const tampered = new Uint8Array(encrypted);
      tampered[tampered.length - 1] ^= 0xff; // flip last byte
      await expect(decrypt(tampered.buffer, 'pass')).rejects.toThrow();
    });
  });
});
