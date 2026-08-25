/**
 * What the method does, and what these benchmarks are and are not evidence for.
 *
 * This page exists because the premise is unusual enough to be misread, and
 * because a tool that reports a number on data the number does not apply to is
 * worse than one that reports nothing. Both halves are written down here rather
 * than left in a README nobody opens.
 */

export function MethodView() {
  return (
    <article className="prose">
      <h2>The stream runs along the feature axis</h2>
      <p>
        This is the premise, and it is the least obvious thing about the method.
        In a feature stream the sample space is fixed and the <em>features</em>{' '}
        arrive over time — a sensor network gaining sensors, a production line
        gaining measurement stages. A window is therefore a contiguous block of
        columns: every window covers every sample, and what evolves between
        windows is how those same samples cluster as new features arrive.
      </p>
      <p>
        Two consequences follow, and both are places an implementation goes
        quietly wrong. The number of windows comes from the feature count, not
        the sample count. And comparing two windows by which samples they put
        together is meaningful precisely because consecutive windows hold the
        same samples.
      </p>

      <h2>Each window</h2>
      <ol>
        <li>
          <strong>Kernel PCA.</strong> The window's columns are mapped through a
          kernel and projected down, so the clustering works on distances that
          reflect similarity rather than raw coordinates.
        </li>
        <li>
          <strong>Density peaks, with reverse-kNN density.</strong> Each point
          gets a density and a distance to the nearest denser point; the points
          that are high in both are the cluster centres, and everything else
          follows its density gradient to one.
        </li>
        <li>
          <strong>The number of centres is read from the data.</strong> Sorted
          by density × distance, the values fall off a cliff after the last real
          centre, and the position of that cliff is the cluster count.
        </li>
      </ol>

      <h2>Between windows</h2>
      <p>
        Every past cluster is compared with every current one by Dice overlap
        over sample indices. A past cluster whose best match reaches 1 is{' '}
        <em>stable</em>, one that reaches the threshold has <em>drifted</em>,
        one that reaches neither has been <em>forgotten</em>; a current cluster
        that matches nothing above the threshold is <em>emerging</em>.
      </p>
      <p>
        <strong>Stable tests an exact 1.</strong> That is the published rule and
        this implementation keeps it, but it is worth knowing what it means in
        practice: on real data two consecutive windows almost never partition the
        samples identically, so stable is nearly always zero and near-identical
        windows are reported as drift.
      </p>

      <h2>What the benchmarks are not</h2>
      <p>
        The eight bundled benchmarks are <strong>not feature streams</strong>.
        Their columns are gene indices and pixel positions, in no order that
        means anything: column 7 is not earlier than column 8. Walking the
        columns imposes an arrival order the data never had, and shuffling that
        order and re-running produces the same answer — which is the measurement
        that shows the order carries no information.
      </p>
      <p>
        They are a fair test of the clustering, of the event rules, and of this
        implementation against the reference. They are not evidence that the
        method detects drift in a stream, because there is no drift in them to
        detect. A synthetic stream with events placed on purpose is what that
        claim rests on.
      </p>

      <h2>Where the work happens</h2>
      <p>
        In this tab. The detector is TypeScript running in a worker thread, so a
        dataset is downloaded once, cached, and clustered on your machine; the
        server stores accounts and saved runs and computes nothing. The port is
        held to the Python reference on these same eight files — same inputs,
        same cluster counts, same events — by the test suite in the repository.
      </p>
    </article>
  )
}
