<template>
  <h1>Help &amp; Documentation</h1>

  <div class="card">
    <div class="card-body">

      <div class="help-section">
        <h2>What is CED-FS?</h2>
        <p>
          <strong>CED-FS</strong> (Concept Evolution Detection with Feature Selection) monitors
          high-dimensional data streams. It uses a <em>sliding window</em> over feature columns,
          applies kernel-based density-peak clustering (K-r-DPC) inside each window, then compares
          consecutive windows via a Dice-coefficient similarity matrix to detect four event types:
        </p>
        <ul style="margin: .5rem 0 0 1.5rem">
          <li><strong>Emerging concept</strong> – a new cluster appears with no predecessor.</li>
          <li><strong>Concept drift</strong>    – a cluster evolved but remains recognisable.</li>
          <li><strong>Concept forgetting</strong> – a past cluster disappears.</li>
          <li><strong>Stable</strong>            – clusters are identical across windows.</li>
        </ul>
      </div>

      <div class="help-section">
        <h2>Quick Start</h2>
        <ol style="margin-left:1.5rem">
          <li>Open the <strong>Data Input</strong> page.</li>
          <li>Upload a <code>.mat</code> feature matrix and a matching label vector.</li>
          <li>Set the <em>window size</em> (number of feature columns per window).</li>
          <li>Click <strong>Run Analysis</strong> and wait for the background task to complete.</li>
          <li>Inspect results on the <strong>Visualization</strong> page.</li>
        </ol>
      </div>

      <div class="help-section">
        <h2>Algorithm Parameters</h2>
        <table class="param-table">
          <thead>
            <tr><th>Parameter</th><th>Default</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td>Kernel type</td><td>1 (Gaussian)</td><td>Kernel function used in K-PCA (1–5).</td></tr>
            <tr><td>&sigma; (sigma)</td><td>6.0</td><td>Kernel bandwidth. Larger values smooth the density estimate.</td></tr>
            <tr><td>p</td><td>0.05</td><td>KNN fraction: k = round(p &times; n).</td></tr>
            <tr><td>&tau; (similarity threshold)</td><td>0.5</td><td>Dice similarity cut-off separating drift from forgetting / emerging.</td></tr>
            <tr><td>Window size</td><td>50</td><td>Number of feature columns per sliding window.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="help-section">
        <h2>Similarity Metric (Dice Coefficient)</h2>
        <p>For past cluster C<sub>i</sub> and current cluster C<sub>j</sub>:</p>
        <div class="formula">S(i,j) = 2 |C_i ∩ C_j| / (|C_i| + |C_j|)</div>
        <p>
          S = 1 &rarr; stable.<br />
          &tau; &le; S &lt; 1 &rarr; concept drift.<br />
          S &lt; &tau; &rarr; forgetting (past) or emerging (current).
        </p>
      </div>

      <div class="help-section">
        <h2>Data Format</h2>
        <p>
          Both files must be MATLAB <code>.mat</code> files.
          The feature matrix should contain a variable named <code>data</code> (shape n &times; d) and
          the label file a variable named <code>label</code> (shape n &times; 1).
          If the variable names differ, the loader automatically uses the first non-system variable.
        </p>
      </div>

    </div>
  </div>
</template>

<script setup>
// HelpView is fully static – no reactive state or API calls needed.
</script>
