import { getDb } from './db';
import { encrypt, decrypt } from './crypto';
import type { UserProfile } from '../profile/types';

const PROFILE_KEY = 'primary';
const HAS_PROFILE_SETTING = 'has_profile';

class ProfileStore {
  private passphrase: string | null = null;

  async unlock(passphrase: string): Promise<void> {
    // Verify passphrase by attempting to decrypt existing profile
    const db = await getDb();
    const existing = await db.get('profiles', PROFILE_KEY);
    if (existing) {
      // Will throw if passphrase is wrong
      await decrypt(existing.encryptedData, passphrase);
    }
    this.passphrase = passphrase;
  }

  isUnlocked(): boolean {
    return this.passphrase !== null;
  }

  getPassphrase(): string | null {
    return this.passphrase;
  }

  lock(): void {
    this.passphrase = null;
  }

  async hasProfile(): Promise<boolean> {
    const db = await getDb();
    const setting = await db.get('settings', HAS_PROFILE_SETTING);
    return setting?.value === 'true';
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    if (!this.passphrase) throw new Error('Store is locked');

    const db = await getDb();
    const json = JSON.stringify(profile);
    const encryptedData = await encrypt(json, this.passphrase);

    await db.put('profiles', {
      id: PROFILE_KEY,
      encryptedData,
      updatedAt: new Date().toISOString(),
    });

    await db.put('settings', { key: HAS_PROFILE_SETTING, value: 'true' });
  }

  async loadProfile(): Promise<UserProfile | null> {
    if (!this.passphrase) throw new Error('Store is locked');

    const db = await getDb();
    const record = await db.get('profiles', PROFILE_KEY);
    if (!record) return null;

    const json = await decrypt(record.encryptedData, this.passphrase);
    return JSON.parse(json) as UserProfile;
  }

  async deleteProfile(): Promise<void> {
    const db = await getDb();
    await db.delete('profiles', PROFILE_KEY);
    await db.put('settings', { key: HAS_PROFILE_SETTING, value: 'false' });
  }

  async initWithPassphrase(passphrase: string): Promise<void> {
    this.passphrase = passphrase;
  }
}

export const profileStore = new ProfileStore();
