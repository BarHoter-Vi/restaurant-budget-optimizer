/**
 * Menu photos are held as blobs in IndexedDB for the lifetime of the session.
 *
 * They never leave the device: there is no server, and nothing here is uploaded
 * anywhere. Keeping them locally means previews survive a refresh so the user can
 * compare the extracted text against the photo, and "התחל מחדש" deletes them.
 *
 * localStorage is unsuitable (string-only, ~5 MB); IndexedDB stores blobs natively.
 */

const DB_NAME = 'rbo-images'
const DB_VERSION = 1
const STORE = 'images'

export interface StoredImage {
  id: string
  name: string
  blob: Blob
  thumbnail: Blob
  createdAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('הדפדפן הזה אינו תומך בשמירת תמונות מקומית'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('שגיאת אחסון מקומי'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = run(tx.objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('שגיאת אחסון מקומי'))
    })
  } finally {
    db.close()
  }
}

export async function putImage(image: StoredImage): Promise<void> {
  await withStore('readwrite', (store) => store.put(image) as IDBRequest<IDBValidKey>)
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  return withStore('readonly', (store) => store.get(id) as IDBRequest<StoredImage | undefined>)
}

export async function getAllImages(): Promise<StoredImage[]> {
  const all = await withStore('readonly', (store) => store.getAll() as IDBRequest<StoredImage[]>)
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function deleteImage(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id) as IDBRequest<undefined>)
}

/** Wipes every stored photo. Part of "התחל מחדש". */
export async function clearImages(): Promise<void> {
  await withStore('readwrite', (store) => store.clear() as IDBRequest<undefined>)
}
