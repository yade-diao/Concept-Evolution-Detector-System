/**
 * The parameters, with what each one actually does written next to it.
 *
 * They are not interchangeable knobs. The window size decides how many windows
 * a stream has - and therefore how long a run takes - and the similarity
 * threshold decides what counts as the same concept from one window to the
 * next, which is the whole classification.
 */

import type { CedFsParameters } from '../cedfs/cedFs'
import { KERNELS, type KernelType } from '../cedfs/kernel'
import { windowCount } from '../cedfs/cedFs'

export const DEFAULTS: CedFsParameters = {
  kernelType: 1,
  sigma: 6,
  p: 0.05,
  windowSize: 50,
  similarityThreshold: 0.5,
}

export function ParameterForm({
  value, onChange, features, disabled,
}: {
  value: CedFsParameters
  onChange: (next: CedFsParameters) => void
  /** The selected benchmark's feature count, to show the resulting run length. */
  features: number | null
  disabled: boolean
}) {
  const set = <K extends keyof CedFsParameters>(key: K, next: CedFsParameters[K]) =>
    onChange({ ...value, [key]: next })

  const windows = features ? windowCount(features, value.windowSize) : null

  return (
    <div className="parameters">
      <label>
        <span className="label">Kernel</span>
        <select
          value={value.kernelType}
          disabled={disabled}
          onChange={(e) => set('kernelType', Number(e.target.value) as KernelType)}
        >
          {Object.entries(KERNELS).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
        <span className="hint">How samples are compared before the projection.</span>
      </label>

      <label>
        <span className="label">Sigma <output>{value.sigma}</output></span>
        <input
          type="range" min={0.5} max={20} step={0.5}
          value={value.sigma} disabled={disabled}
          onChange={(e) => set('sigma', Number(e.target.value))}
        />
        <span className="hint">
          Kernel bandwidth. Small values make every sample look distinct; large
          ones make them all look alike.
        </span>
      </label>

      <label>
        <span className="label">Neighbourhood <output>{value.p}</output></span>
        <input
          type="range" min={0.01} max={0.3} step={0.01}
          value={value.p} disabled={disabled}
          onChange={(e) => set('p', Number(e.target.value))}
        />
        <span className="hint">
          As a fraction of the samples. The density each point is judged by is
          counted over this many neighbours.
        </span>
      </label>

      <label>
        <span className="label">Window size <output>{value.windowSize}</output></span>
        <input
          type="range" min={10} max={200} step={10}
          value={value.windowSize} disabled={disabled}
          onChange={(e) => set('windowSize', Number(e.target.value))}
        />
        <span className="hint">
          Columns per window — the stream runs along the feature axis.
          {windows !== null && <> This benchmark becomes <strong>{windows}</strong> windows.</>}
        </span>
      </label>

      <label>
        <span className="label">Similarity threshold <output>{value.similarityThreshold}</output></span>
        <input
          type="range" min={0.05} max={0.95} step={0.05}
          value={value.similarityThreshold} disabled={disabled}
          onChange={(e) => set('similarityThreshold', Number(e.target.value))}
        />
        <span className="hint">
          Below it a cluster has no counterpart in the next window and is
          reported as forgotten; above it, as drifted.
        </span>
      </label>
    </div>
  )
}
