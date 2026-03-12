<template>
  <h1>Algorithm Parameters</h1>

  <!-- ── Kernel & density ────────────────────────────────────────── -->
  <div class="card">
    <div class="card-header"><h2 class="card-title">Kernel &amp; Density Estimation</h2></div>
    <div class="card-body">

      <div class="form-group">
        <label>Kernel function:</label>
        <!-- v-model keeps params.kernelType in sync with the <select> value -->
        <select v-model.number="params.kernelType">
          <option :value="1">Gaussian (RBF)</option>
          <option :value="2">Polynomial</option>
          <option :value="3">Linear</option>
          <option :value="4">Exponential</option>
          <option :value="5">Laplacian</option>
        </select>
        <p class="param-desc">The kernel used for K-PCA. Gaussian is recommended for most datasets.</p>
      </div>

      <div class="form-group">
        <label>Kernel bandwidth &sigma;: <strong>{{ params.sigma }}</strong></label>
        <input type="range" class="slider" min="1" max="20" step="0.5" v-model.number="params.sigma" />
        <p class="param-desc">Controls the width of the kernel. Larger values merge clusters.</p>
      </div>

      <div class="form-group">
        <label>KNN fraction p: <strong>{{ params.p.toFixed(3) }}</strong></label>
        <input type="range" class="slider" min="0.001" max="0.3" step="0.001" v-model.number="params.p" />
        <p class="param-desc">Fraction of samples used as K in KNN (k = p × n).</p>
      </div>

    </div>
  </div>

  <!-- ── Concept evolution ───────────────────────────────────────── -->
  <div class="card">
    <div class="card-header"><h2 class="card-title">Concept Evolution</h2></div>
    <div class="card-body">

      <div class="form-group">
        <label>Similarity threshold &tau;: <strong>{{ params.similarityThreshold.toFixed(2) }}</strong></label>
        <input type="range" class="slider" min="0.05" max="0.95" step="0.05" v-model.number="params.similarityThreshold" />
        <p class="param-desc">Clusters with similarity &ge; &tau; are classified as drift; below &tau; as forgetting / emerging.</p>
      </div>

    </div>
  </div>

  <!-- ── Actions ────────────────────────────────────────────────── -->
  <div class="form-buttons">
    <button class="btn btn-primary" @click="saveParameters">
      <i class="fas fa-save"></i> Save
    </button>
    <button class="btn btn-secondary" @click="resetParameters">
      <i class="fas fa-undo"></i> Reset to defaults
    </button>
  </div>
</template>

<script setup>
import { reactive, onMounted, inject } from 'vue'

const notify = inject('notify')

// ── Parameters reactive state ─────────────────────────────────────────────────
// reactive() makes a plain object deeply reactive (two-way with v-model)
const params = reactive({
  kernelType:          1,
  sigma:               6.0,
  p:                   0.05,
  similarityThreshold: 0.5,
})

// ── Load current params from the backend when the page mounts ─────────────────
onMounted(loadParameters)

async function loadParameters() {
  try {
    const res  = await fetch('/api/parameters')
    const data = await res.json()
    // Overwrite only known keys, keeping defaults for any missing fields
    Object.assign(params, data)
  } catch (err) {
    notify('Failed to load parameters.', 'error')
  }
}

async function saveParameters() {
  try {
    const res  = await fetch('/api/parameters', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(params),
    })
    const data = await res.json()
    if (data.success) {
      notify('Parameters saved.')
    } else {
      notify((data.errors || ['Save failed']).join(' '), 'error')
    }
  } catch (err) {
    notify('Network error: ' + err.message, 'error')
  }
}

async function resetParameters() {
  try {
    const res  = await fetch('/api/parameters/reset', { method: 'POST' })
    const data = await res.json()
    if (data.success) {
      Object.assign(params, data.parameters)
      notify('Parameters reset to defaults.')
    }
  } catch (err) {
    notify('Network error: ' + err.message, 'error')
  }
}
</script>
