/**
 * The API, typed, in one place.
 *
 * The server stores accounts and runs; it computes nothing. A run therefore
 * carries the *shape* of the data - which dataset, how many samples, how many
 * features, which parameters - and later its result. The matrix never travels:
 * it is already in the browser that did the work.
 *
 * Errors arrive as `{detail, at}` and are turned into an `ApiError` carrying the
 * status, so a caller can tell "your token expired" (401) from "that is not a
 * valid sigma" (400) without parsing prose.
 */

const BASE = '/api/v1'

export interface Token {
  accessToken: string
  tokenType: string
  expiresInSeconds: number
}

export interface Parameters {
  kernelType: number
  sigma: number
  /** The algorithm's `p`, named on the wire for what it is. */
  neighbourFraction: number
  similarityThreshold: number
  windowSize: number
}

export type RunState = 'RUNNING' | 'SUCCEEDED' | 'FAILED'

export interface RunSummary {
  id: string
  state: RunState
  datasetName: string
  windowsTotal: number
  windowsDone: number
  bestRandIndex?: number
  createdAt: string
  finishedAt?: string
}

export interface RunView extends RunSummary {
  samples: number
  features: number
  parameters: Parameters
  clusterCounts?: number[]
  events?: Record<string, number[]>
  error?: string
}

/** A dataset the account keeps on the server. */
export interface StoredDataset {
  id: string
  name: string
  samples: number
  features: number
  classes: number
  sizeBytes: number
  createdAt: string
}

export interface DatasetContent extends Omit<StoredDataset, 'sizeBytes' | 'createdAt'> {
  features64: string
  labels64: string
}

export interface StorageUsage {
  usedBytes: number
  quotaBytes: number
  datasets: number
}

export interface Me {
  id: string
  name: string
  role: 'USER' | 'ADMIN' | 'GUEST'
  expiresAt?: string
}

export interface AccountRow {
  id: string
  name: string
  role: 'USER' | 'ADMIN' | 'GUEST'
  runs: number
  createdAt: string
  expiresAt?: string
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }

  /** The token is gone or expired; the caller should sign in again. */
  get isUnauthorised(): boolean {
    return this.status === 401 || this.status === 403
  }
}

async function request<T>(
  path: string,
  { token, method = 'GET', body }: {
    token?: string | null
    method?: string
    body?: unknown
  } = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(BASE + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // A failed fetch is the network, not the API: say so rather than reporting
    // a status the server never sent.
    throw new ApiError(0, 'the server could not be reached')
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new ApiError(response.status, payload?.detail ?? response.statusText)
  }
  return payload as T
}

export const api = {
  register: (email: string, password: string) =>
    request<Token>('/auth/register', { method: 'POST', body: { email, password } }),

  login: (email: string, password: string) =>
    request<Token>('/auth/login', { method: 'POST', body: { email, password } }),

  /** A session with no account behind it, for this tab. */
  guest: () => request<Token>('/auth/guest', { method: 'POST' }),

  /** Who this token names, and what it may do. */
  me: (token: string) => request<Me>('/auth/me', { token }),

  /** Keep a guest's runs under an account that stays. */
  claim: (token: string, email: string, password: string) =>
    request<Token>('/auth/claim', { token, method: 'POST', body: { email, password } }),

  createRun: (token: string, run: {
    datasetName: string
    samples: number
    features: number
    parameters: Parameters
  }) => request<RunView>('/runs', { token, method: 'POST', body: run }),

  reportProgress: (token: string, id: string, windowsDone: number) =>
    request<RunView>(`/runs/${id}/progress`, {
      token, method: 'PATCH', body: { windowsDone },
    }),

  submitResult: (token: string, id: string, result: {
    bestRandIndex?: number
    clusterCounts?: number[]
    events?: Record<string, number[]>
    error?: string
  }) => request<RunView>(`/runs/${id}/result`, { token, method: 'POST', body: result }),

  listRuns: (token: string, page = 0, size = 20) =>
    request<RunSummary[]>(`/runs?page=${page}&size=${size}`, { token }),

  getRun: (token: string, id: string) => request<RunView>(`/runs/${id}`, { token }),

  deleteRun: (token: string, id: string) =>
    request<void>(`/runs/${id}`, { token, method: 'DELETE' }),

  // ── Datasets an account keeps ────────────────────────────────────────────

  listDatasets: (token: string) => request<StoredDataset[]>('/datasets', { token }),

  storageUsage: (token: string) => request<StorageUsage>('/datasets/usage', { token }),

  uploadDataset: (token: string, body: {
    name: string
    samples: number
    features: number
    classes: number
    features64: string
    labels64: string
  }) => request<StoredDataset>('/datasets', { token, method: 'POST', body }),

  getDataset: (token: string, id: string) =>
    request<DatasetContent>(`/datasets/${id}`, { token }),

  deleteDataset: (token: string, id: string) =>
    request<void>(`/datasets/${id}`, { token, method: 'DELETE' }),

  // ── Administration ───────────────────────────────────────────────────────

  listAccounts: (token: string) => request<AccountRow[]>('/admin/users', { token }),

  deleteAccount: (token: string, id: string) =>
    request<void>(`/admin/users/${id}`, { token, method: 'DELETE' }),
}
