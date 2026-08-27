/**
 * The way in, and the only page there is until you take it.
 *
 * Nothing behind this runs without a session - not even the example
 * benchmarks, which compute in the browser and need no server at all. That is
 * a deliberate cost: the alternative is a visitor who runs something, likes
 * it, and finds afterwards that nothing was kept because they never said who
 * they were. Choosing first is one click and makes the answer to "where did my
 * run go" true in both directions.
 *
 * The hero is a real result rather than a description of one. The bars are
 * `arcene`, from the reference answers the test suite checks every build
 * against: four windows of fifty features, and the clustering finds two
 * groups, then three, then four, then three again. That rise and fall is the
 * entire thesis of the tool, and showing the actual numbers is more honest
 * than a sentence claiming it happens.
 */

import type { ReactNode } from 'react'

/** arcene, 4 windows of 50 features - tests/reference/answers.json. */
const CLUSTERS = [2, 3, 4, 3]

export function Gate({ children }: { children: ReactNode }) {
  const tallest = Math.max(...CLUSTERS)

  return (
    <div className="gate">
      <div className="gate-hero">
        <p className="eyebrow">CED-FS · feature stream</p>
        <h1>Concept<br />Evolution<br />Detector</h1>
        <p className="subtitle">
          The stream runs along the feature axis: the samples stay, the features
          arrive. This watches concepts appear, move and disappear as they do —
          clustered in your browser, not on a server.
        </p>

        <figure className="motif">
          <div className="motif-rail" aria-hidden="true">
            {CLUSTERS.map((count, index) => (
              <div key={index} className="tick" style={{ height: `${count / tallest * 100}%` }}>
                <span>{count}</span>
              </div>
            ))}
          </div>
          <figcaption>
            One tick per window, as tall as the concepts it found. This is{' '}
            <code>arcene</code>: four windows of fifty features, two groups
            becoming four and then three again.
          </figcaption>
        </figure>
      </div>

      <div className="gate-doors">{children}</div>
    </div>
  )
}
