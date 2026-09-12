/**
 * 🗄️ كاش محلي (IndexedDB) لبيانات أوراق Google Sheets الكبيرة.
 * الهدف: فتح الأنظمة فوراً بالبيانات المخزَّنة ثم تحديثها في الخلفية،
 * بدل انتظار تنزيل عشرات آلاف الأسطر في كل مرة.
 */

const DB_NAME = 'sheet-cache';
const STORE = 'sheets';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export interface CachedSheet<T> {
  at: number;
  value: T;
}

export async function readSheetCache<T>(key: string, maxAgeMs = 24 * 60 * 60 * 1000): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const rec = req.result as CachedSheet<T> | undefined;
        if (!rec || typeof rec.at !== 'number') return resolve(null);
        if (Date.now() - rec.at > maxAgeMs) return resolve(null);
        resolve(rec.value);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeSheetCache<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ at: Date.now(), value } as CachedSheet<T>, key);
  } catch {
    /* تجاهل */
  }
}
