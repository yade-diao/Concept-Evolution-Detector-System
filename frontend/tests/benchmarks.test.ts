/**
 * The whole method, on the real benchmarks, against the Python reference.
 *
 * This is the test that matters: it reads the same `.mat` files the reference
 * read, runs the stream the same way, and compares what came out. The datasets
 * are the eight the paper reports on, so the port is held to the method on the
 * data the method was published for rather than on a synthetic stream chosen to
 * be easy.
 *
 * Cluster counts and events are compared exactly. They are integers, and the
 * count in particular is what ced-api validates a submitted result against - an
 * off-by-one has the API reject work that was correct. The Rand Index is
 * compared to six places, which is far tighter than any difference that would
 * matter and far looser than the last bit of a float.
 *
 * Each case runs over the first `featureLimit` columns of its benchmark. A
 * shorter stream is a shorter run of the same code - `CED_FS` and `cedFs` both
 * derive their window count from the feature count they are handed - so nothing
 * about the truncation is special-cased on either side.
 *
 * Regenerate the answers with `python -m tests.generate_reference_answers` when
 * the method changes, never to make a failing test pass.
 */

import { describe, expect, it } from 'vitest'

import { cedFs } from '../src/cedfs/cedFs'
import { answers, columns, dataset } from './reference'

/**
 * gisette is 1 000 samples and the port's eigendecomposition is a Jacobi sweep
 * over an n x n matrix: about a minute a window, against nine seconds in NumPy.
 * Its answers are recorded either way, so `CED_SLOW_BENCHMARKS=1 npm test`
 * checks them; the default run skips it rather than spend two minutes proving
 * what the other seven already showed.
 */
const runSlow = process.env.CED_SLOW_BENCHMARKS === '1'

describe('CED-FS on the bundled benchmarks', () => {
  for (const kase of answers.benchmarks) {
    const title = `${kase.slug} over ${kase.featureLimit} features ` +
      `(${kase.expectedWindows} windows of ${kase.windowSize})`

    it.skipIf(kase.slow && !runSlow)(title, async () => {
      const data = await dataset(kase.slug)
      const features = columns(
        data.features, data.samples, data.featureCount, 0, kase.featureLimit)

      const result = cedFs(
        { features, samples: data.samples, featureCount: kase.featureLimit, labels: data.labels },
        { ...answers.parameters, windowSize: kase.windowSize })

      expect(result.windowsTotal).toBe(kase.expectedWindows)
      expect(result.clusterCounts).toEqual(kase.expectedClusterCounts)
      expect(result.events).toEqual(kase.expectedEvents)
      expect(result.bestRandIndex).toBeCloseTo(kase.expectedBestRandIndex, 6)

      // The stream runs along the feature axis: every window covers every
      // sample, and only the columns it sees differ. A port that windowed the
      // sample axis instead would still produce plausible numbers, so this is
      // asserted rather than assumed.
      for (const window of result.windows) {
        expect(window.cluster).toHaveLength(data.samples)
      }
      expect(result.events.drift).toHaveLength(kase.expectedWindows - 1)
    }, kase.slow ? 600_000 : 120_000)
  }
})
