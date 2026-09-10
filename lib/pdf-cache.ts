const DATABASE_NAME = 'insou-menu-pdf-cache';
const DATABASE_VERSION = 1;
const STORE_NAME = 'pdfs';

interface CachedPdf {
  key: string;
  menuId: string;
  updatedAt: string;
  blob: Blob;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'key',
        });
        store.createIndex('menuId', 'menuId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedPdf(
  menuId: string,
  updatedAt: string,
): Promise<Blob | null> {
  if (typeof indexedDB === 'undefined') return null;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const record = await requestResult<CachedPdf | undefined>(
      transaction.objectStore(STORE_NAME).get(`${menuId}:${updatedAt}`),
    );
    return record?.blob ?? null;
  } finally {
    database.close();
  }
}

export async function storeCachedPdf(
  menuId: string,
  updatedAt: string,
  blob: Blob,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const oldKeys = await requestResult<IDBValidKey[]>(
      store.index('menuId').getAllKeys(menuId),
    );
    for (const oldKey of oldKeys) store.delete(oldKey);
    store.put({
      key: `${menuId}:${updatedAt}`,
      menuId,
      updatedAt,
      blob,
    } satisfies CachedPdf);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function removeCachedPdf(menuId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const keys = await requestResult<IDBValidKey[]>(
      store.index('menuId').getAllKeys(menuId),
    );
    for (const key of keys) store.delete(key);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
