import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'quote-compare';
const DB_VERSION = 1;

export interface QuoteCompareDB {
  profiles: {
    key: string;
    value: {
      id: string;
      encryptedData: ArrayBuffer;
      updatedAt: string;
    };
  };
  quotes: {
    key: string;
    value: {
      id: string;
      provider: string;
      productType: string;
      data: string; // JSON string of QuoteResult
      retrievedAt: string;
    };
    indexes: {
      'by-provider': string;
      'by-date': string;
    };
  };
  settings: {
    key: string;
    value: {
      key: string;
      value: string;
    };
  };
  adapterHealth: {
    key: string;
    value: {
      adapterId: string;
      status: 'healthy' | 'degraded' | 'broken';
      lastChecked: string;
      error?: string;
    };
  };
}

let dbInstance: IDBPDatabase | null = null;

export async function getDb(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Profiles store (encrypted)
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'id' });
      }

      // Quote results
      if (!db.objectStoreNames.contains('quotes')) {
        const quoteStore = db.createObjectStore('quotes', { keyPath: 'id' });
        quoteStore.createIndex('by-provider', 'provider');
        quoteStore.createIndex('by-date', 'retrievedAt');
      }

      // Settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // Adapter health
      if (!db.objectStoreNames.contains('adapterHealth')) {
        db.createObjectStore('adapterHealth', { keyPath: 'adapterId' });
      }
    },
  });

  return dbInstance;
}
