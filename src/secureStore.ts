import type { EncryptedSecret } from './types';

/**
 * Encrypts secrets (LD API access tokens) with AES-GCM using a non-extractable key kept in
 * IndexedDB. The plaintext never touches localStorage and the raw key can't be read out of
 * the browser. Any script running on this origin can still ask the browser to decrypt, so
 * this protects against copied or inspected storage, not against a compromised page.
 */

const DB_NAME = 'lts-crypto';
const STORE = 'keys';
const KEY_ID = 'token-key';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb<T>(db: IDBDatabase, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = op(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

let cached: CryptoKey | null = null;
let creating: Promise<CryptoKey | null> | null = null;

async function getKey(create: boolean): Promise<CryptoKey | null> {
  const db = await openDb();
  try {
    const existing = await idb<CryptoKey | undefined>(db, 'readonly', (s) => s.get(KEY_ID));
    if (existing) return existing;
    if (!create) return null;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    await idb(db, 'readwrite', (s) => s.put(key, KEY_ID));
    return key;
  } finally {
    db.close();
  }
}

async function cachedKey(create: boolean): Promise<CryptoKey | null> {
  if (cached) return cached;
  if (create) {
    // Share one in-flight creation so concurrent saves can't generate two different keys.
    creating ??= getKey(true).finally(() => (creating = null));
    cached = await creating;
  } else {
    cached = await getKey(false);
  }
  return cached;
}

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptSecret(plain: string): Promise<EncryptedSecret> {
  const key = await cachedKey(true);
  if (!key) throw new Error('Could not create an encryption key');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return { iv: toB64(iv), data: toB64(data) };
}

/** Throws if this browser no longer has the key (e.g. site data was cleared) or the data was tampered with. */
export async function decryptSecret(secret: EncryptedSecret): Promise<string> {
  const key = await cachedKey(false);
  if (!key) throw new Error('This browser no longer has the key for this token. Enter the token again.');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(secret.iv) },
    key,
    fromB64(secret.data),
  );
  return new TextDecoder().decode(plain);
}
