/**
 * Datasets someone brought, in this browser and optionally on the server.
 *
 * Local first, and local is enough: a file dropped here is parsed, kept in
 * IndexedDB, and can be run on immediately without an account and without the
 * bytes leaving the machine. That is the honest default for data somebody may
 * not be allowed to upload anywhere.
 *
 * Uploading is a second, deliberate step that buys one thing: the same file on
 * another machine. The server stores the parsed arrays rather than the original
 * file, because the parse already happened here and a second parser there would
 * be a second answer to what the file says.
 */

import { api, type StoredDataset } from '../api/client'
import type { Dataset, DatasetInfo } from './load'
import { minMaxNormalise } from './load'
import { readMat } from './mat'

const DB_NAME = 'ced-mine'
const DB_VERSION = 1
const STORE = 'datasets'

/** A dataset in this browser, whether or not the server has a copy. */
export interface LocalDataset {
  id: string
  name: string
  samples: number
  featureCount: number
  classes: number
  /** Row-major, unnormalised - scaling happens per run, as for the bundled ones. */
  features: Float64Array
  labels: Int32Array
  addedAt: number
  /** The server's id, once uploaded. */
  remoteId?: string
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transact<T>(mode: IDBTransactionMode,
                     run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }))
}

export async function listLocal(): Promise<LocalDataset[]> {
  try {
    const all = await transact<LocalDataset[]>('readonly', (store) => store.getAll())
    return all.sort((a, b) => b.addedAt - a.addedAt)
  } catch {
    return []
  }
}

export function saveLocal(dataset: LocalDataset): Promise<unknown> {
  return transact('readwrite', (store) => store.put(dataset))
}

export function deleteLocal(id: string): Promise<unknown> {
  return transact('readwrite', (store) => store.delete(id))
}

/**
 * Read a file the way the tool needs it: a matrix and one label per row.
 *
 * Two shapes are accepted, because those are the two ways this data actually
 * arrives. A `.mat` holding two variables is a feature matrix and a label
 * vector; anything else - a `.mat` with one variable, a CSV, a TSV - is a
 * matrix whose **last column is the class label**, which is how these
 * benchmarks are published outside MATLAB.
 *
 * The file is never uploaded to be parsed. This runs on the visitor's machine
 * and so does everything after it.
 */
export async function readUserFile(file: File): Promise<LocalDataset> {
  const name = file.name.replace(/\.[^.]+$/, '')
  const bytes = new Uint8Array(await file.arrayBuffer())

  if (file.name.toLowerCase().endsWith('.mat')) {
    const arrays = await readMat(bytes)
    if (arrays.length === 0) throw new Error('that .mat holds no numeric array')
    if (arrays.length >= 2) {
      const [features, labels] = arrays
      return assemble(name, features.data, features.rows, features.cols,
        Int32Array.from(labels.data))
    }
    const only = arrays[0]
    return splitLastColumn(name, only.data, only.rows, only.cols)
  }

  const text = new TextDecoder().decode(bytes)
  const rows = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (rows.length < 2) throw new Error('that file has fewer than two rows')

  const separator = rows[0].includes('\t') ? '\t' : rows[0].includes(';') ? ';' : ','
  const cells = rows.map((row) => row.split(separator))
  // A header line is one whose first row will not parse as numbers.
  const numeric = cells[0].every((cell) => cell.trim() !== '' && Number.isFinite(Number(cell)))
  const body = numeric ? cells : cells.slice(1)
  const width = body[0].length
  if (width < 3) throw new Error('a dataset needs at least two features and a label column')

  const values = new Float64Array(body.length * width)
  body.forEach((row, r) => {
    if (row.length !== width) {
      throw new Error(`row ${r + 1} has ${row.length} values where the first row has ${width}`)
    }
    row.forEach((cell, c) => {
      const value = Number(cell)
      if (!Number.isFinite(value)) {
        throw new Error(`row ${r + 1}, column ${c + 1} is not a number: "${cell.trim()}"`)
      }
      values[r * width + c] = value
    })
  })

  return splitLastColumn(name, values, body.length, width)
}

function splitLastColumn(name: string, values: Float64Array, rows: number, cols: number) {
  const width = cols - 1
  const features = new Float64Array(rows * width)
  const labels = new Int32Array(rows)
  for (let r = 0; r < rows; r++) {
    features.set(values.subarray(r * cols, r * cols + width), r * width)
    labels[r] = Math.round(values[r * cols + width])
  }
  return assemble(name, features, rows, width, labels)
}

function assemble(name: string, features: Float64Array, rows: number, cols: number,
                  labels: Int32Array): LocalDataset {
  if (rows < 2 || cols < 2) throw new Error(`${rows} x ${cols} is too small to window`)
  if (labels.length !== rows) {
    throw new Error(`${labels.length} labels for ${rows} rows`)
  }
  return {
    id: crypto.randomUUID(),
    name,
    samples: rows,
    featureCount: cols,
    classes: new Set(labels).size,
    features,
    labels,
    addedAt: Date.now(),
  }
}

/** A local dataset in the form a run takes, scaled the way the bundled ones are. */
export function toDataset(local: LocalDataset): Dataset {
  return {
    slug: `mine:${local.id}`,
    samples: local.samples,
    featureCount: local.featureCount,
    features: minMaxNormalise(local.features, local.samples, local.featureCount),
    labels: local.labels,
  }
}

/** The picker entry for a local dataset - no story, because nobody wrote one. */
export function toInfo(local: LocalDataset): DatasetInfo {
  return {
    slug: `mine:${local.id}`,
    name: local.name,
    dataFile: '',
    labelFile: '',
    samples: local.samples,
    features: local.featureCount,
    classes: local.classes,
    sizeBytes: local.features.byteLength + local.labels.byteLength,
    ordered: undefined,
  }
}

function toBase64(array: Float64Array | Int32Array): string {
  const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
  let binary = ''
  // In chunks: String.fromCharCode with a few million arguments overflows the
  // call stack, and these arrays run to megabytes.
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** Put a local dataset on the server, against the account's allowance. */
export async function upload(token: string, local: LocalDataset): Promise<StoredDataset> {
  const stored = await api.uploadDataset(token, {
    name: local.name,
    samples: local.samples,
    features: local.featureCount,
    classes: local.classes,
    features64: toBase64(local.features),
    labels64: toBase64(local.labels),
  })
  await saveLocal({ ...local, remoteId: stored.id })
  return stored
}

/** Bring one back from the server into this browser. */
export async function download(token: string, id: string): Promise<LocalDataset> {
  const content = await api.getDataset(token, id)
  const local: LocalDataset = {
    id: crypto.randomUUID(),
    name: content.name,
    samples: content.samples,
    featureCount: content.features,
    classes: content.classes,
    features: new Float64Array(fromBase64(content.features64)),
    labels: new Int32Array(fromBase64(content.labels64)),
    addedAt: Date.now(),
    remoteId: content.id,
  }
  await saveLocal(local)
  return local
}
