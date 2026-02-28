import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'quote-compare';
const DB_VERSION = 2;

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
  // Crowdsourced adaptor cache
  adaptorCache: {
    key: string;
    value: {
      adaptorId: string;
      definition: any; // AdaptorDefinition (imported separately to avoid circular deps)
      cachedAt: string;
    };
  };
  // Pending contributions to submit to the central service
  pendingContributions: {
    key: string;
    value: {
      id: string;
      contribution: any; // StepContribution
      createdAt: string;
      retryCount: number;
    };
  };
  // Selector health telemetry (tracks which selectors work/fail per run)
  selectorHealth: {
    key: string;
    value: {
      id: string;
      adaptorId: string;
      stepId: string;
      fieldPath: string;
      primarySelector: string;
      primaryWorked: boolean;
      fallbackUsed: string | null;
      labelMatchUsed: boolean;
      timestamp: string;
    };
    indexes: {
      'by-adaptor': string;
    };
  };
}

let dbInstance: IDBPDatabase | null = null;

export async function getDb(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // --- v1 stores ---
      if (oldVersion < 1) {
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
      }

      // --- v2 stores (crowdsourced adaptors) ---
      if (oldVersion < 2) {
        // Cached adaptor definitions fetched from the central service
        if (!db.objectStoreNames.contains('adaptorCache')) {
          db.createObjectStore('adaptorCache', { keyPath: 'adaptorId' });
        }

        // Queued contributions awaiting submission
        if (!db.objectStoreNames.contains('pendingContributions')) {
          db.createObjectStore('pendingContributions', { keyPath: 'id' });
        }

        // Selector health telemetry
        if (!db.objectStoreNames.contains('selectorHealth')) {
          const healthStore = db.createObjectStore('selectorHealth', { keyPath: 'id' });
          healthStore.createIndex('by-adaptor', 'adaptorId');
        }
      }
    },
  });

  return dbInstance;
}
