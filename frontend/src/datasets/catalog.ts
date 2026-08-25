/**
 * Getting a benchmark into the browser, once.
 *
 * The files are served from the same origin as the page - `/datasets/...` -
 * which is why the deployment puts the static site and the API behind one
 * proxy. Two of the eight benchmarks exist at these exact shapes nowhere else
 * on the public internet, and the public host of a third sends no CORS headers
 * at all, so "fetch it from upstream" was never actually available.
 *
 * A dataset is 1-7 MB and never changes. It is cached in IndexedDB after the
 * first visit, so a second run costs a parse and no download.
 */

import { loadDataset, type Dataset, type DatasetInfo } from './load'

const DB_NAME = 'ced-datasets'
const DB_VERSION = 1
const STORE = 'files'

/** Where the files live, relative to the page. */
const ROOT = 'datasets'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function read(db: IDBDatabase, key: string): Promise<ArrayBuffer | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    request.onsuccess = () => resolve(request.result as ArrayBuffer | undefined)
    request.onerror = () => reject(request.error)
  })
}

function write(db: IDBDatabase, key: string, value: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).put(value, key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * One file, from the cache if it is there.
 *
 * A cache that cannot be opened - private browsing, a browser with storage
 * disabled - is not an error worth failing a run over, so every storage step
 * falls back to the network rather than throwing.
 */
async function file(name: string, onProgress?: (loaded: number, total: number) => void)
  : Promise<ArrayBuffer> {
  let db: IDBDatabase | null = null
  try {
    db = await open()
    const cached = await read(db, name)
    if (cached) return cached
  } catch {
    db = null
  }

  const response = await fetch(`${ROOT}/${name}`)
  if (!response.ok) {
    throw new Error(`${name} could not be downloaded (${response.status})`)
  }

  const total = Number(response.headers.get('content-length') ?? 0)
  let bytes: ArrayBuffer
  if (onProgress && response.body && total > 0) {
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.length
      onProgress(loaded, total)
    }
    const joined = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) {
      joined.set(chunk, offset)
      offset += chunk.length
    }
    bytes = joined.buffer
  } else {
    bytes = await response.arrayBuffer()
  }

  if (db) {
    try {
      await write(db, name, bytes)
    } catch {
      // A full quota is not a reason to fail the run the user asked for.
    }
  }
  return bytes
}

/** The catalogue of benchmarks the deployment serves. */
export async function catalogue(): Promise<DatasetInfo[]> {
  const response = await fetch(`${ROOT}/manifest.json`)
  if (!response.ok) throw new Error(`no dataset catalogue (${response.status})`)
  return response.json()
}

export interface FetchProgress {
  /** Which of the two files is being fetched. */
  file: string
  loaded: number
  total: number
}

/** One benchmark, ready to run: downloaded or cached, parsed, normalised. */
export async function fetchDataset(
  info: DatasetInfo,
  onProgress?: (progress: FetchProgress) => void,
): Promise<Dataset> {
  const data = await file(info.dataFile, (loaded, total) =>
    onProgress?.({ file: info.dataFile, loaded, total }))
  const labels = await file(info.labelFile, (loaded, total) =>
    onProgress?.({ file: info.labelFile, loaded, total }))
  return loadDataset(info, data, labels)
}

/** Whether a benchmark is already in the cache, for the catalogue to show. */
export async function isCached(info: DatasetInfo): Promise<boolean> {
  try {
    const db = await open()
    const [data, labels] = await Promise.all([
      read(db, info.dataFile), read(db, info.labelFile)])
    return data !== undefined && labels !== undefined
  } catch {
    return false
  }
}

/** Drop everything cached, for a user who wants the space back. */
export async function clearCache(): Promise<void> {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).clear()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
