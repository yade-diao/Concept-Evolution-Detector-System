/**
 * The bundled fleets (datasets/bundled/fleets): manifest and decoding.
 *
 * Each file is little-endian int16, (units, samples, variables), with a
 * per-variable offset and scale: value = offset + scale * code — the format
 * `cedfs/fleets.py` reads, so the reference and the port see the same numbers.
 */

import type { Fleet } from '../cedfs/fleet'

export interface FleetInfo {
  slug: string
  title: string
  why: string
  file: string
  units: number
  samples: number
  variables: string[]
  offset: number[]
  scale: number[]
  unitNames: string[]
  sampleMinutes: number | null
  sampleUnit?: string
  window: number
  monitor: 'clustering' | 'deviation' | 'ownChange'
  alpha?: number
  baseline?: number
  m?: number
  level?: number
  truth: { faultyUnits?: number[]; onsetSample?: number; lifeCycles?: number[] }
  source: string
}

export function decodeFleet(info: FleetInfo, buffer: ArrayBuffer): Fleet {
  const V = info.variables.length
  const codes = new Int16Array(buffer)
  if (codes.length !== info.units * info.samples * V) {
    throw new Error(`${info.file}: ${codes.length} values, expected ${info.units * info.samples * V}`)
  }
  const data = new Float64Array(codes.length)
  for (let i = 0; i < codes.length; i++) {
    const v = i % V
    data[i] = info.offset[v] + info.scale[v] * codes[i]
  }
  return { data, units: info.units, samples: info.samples, variables: V }
}

export async function fetchFleets(): Promise<FleetInfo[]> {
  const response = await fetch('/datasets/fleets/manifest.json')
  if (!response.ok) throw new Error(`fleet manifest: HTTP ${response.status}`)
  return response.json()
}

export async function fetchFleet(info: FleetInfo): Promise<Fleet> {
  const response = await fetch(`/datasets/fleets/${info.file}`)
  if (!response.ok) throw new Error(`${info.file}: HTTP ${response.status}`)
  return decodeFleet(info, await response.arrayBuffer())
}
