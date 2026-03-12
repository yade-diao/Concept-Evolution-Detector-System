<template>
  <h1>CED-FS &mdash; Concept Evolution Detector</h1>

  <!-- ── Data upload ─────────────────────────────────────────────── -->
  <div class="card">
    <div class="card-header"><h2 class="card-title">Data Input</h2></div>
    <div class="card-body">

      <div class="form-group">
        <label>Feature matrix (.mat):</label>
        <!-- @change stores the File object into the ref -->
        <input type="file" accept=".mat" @change="dataFile = $event.target.files[0]" />
      </div>

      <div class="form-group">
        <label>Label vector (.mat):</label>
        <input type="file" accept=".mat" @change="labelFile = $event.target.files[0]" />
      </div>

      <div class="form-group">
        <label>Window size (features per window):</label>
        <input type="number" v-model.number="windowLength" min="1" />
      </div>

      <div class="form-buttons">
        <button class="btn btn-primary" @click="startAnalysis">
          <i class="fas fa-play"></i> Run Analysis
        </button>
        <button class="btn btn-danger" @click="clearData">
          <i class="fas fa-trash-alt"></i> Clear
        </button>
      </div>
    </div>
  </div>

  <!-- ── Status ──────────────────────────────────────────────────── -->
  <div class="card">
    <div class="card-header"><h2 class="card-title">Processing Status</h2></div>
    <div class="card-body">
      <!-- :class binding applies the CSS class dynamically -->
      <div :class="['status', `status-${statusType}`]">{{ statusText }}</div>
      <div class="progress-container">
        <div class="progress-bar" :style="{ width: progressPct + '%' }">{{ progressPct }}%</div>
      </div>
      <p>Windows processed: {{ windowsDone }} / {{ windowsTotal }}</p>
    </div>
  </div>

  <!-- ── Concept evolution event counters ────────────────────────── -->
  <div class="card">
    <div class="card-header"><h2 class="card-title">Concept Evolution Events</h2></div>
    <div class="card-body">
      <div class="drift-indicators">
        <div class="drift-indicator emerging">
          <h3>Emerging</h3>
          <div>{{ eventSum(events.emerging) }}</div>
        </div>
        <div class="drift-indicator drifting">
          <h3>Drift</h3>
          <div>{{ eventSum(events.drift) }}</div>
        </div>
        <div class="drift-indicator forgetting">
          <h3>Forgetting</h3>
          <div>{{ eventSum(events.forgetting) }}</div>
        </div>
        <div class="drift-indicator no-evolution">
          <h3>Stable</h3>
          <div>{{ eventSum(events.stable) }}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Clustering metrics ──────────────────────────────────────── -->
  <div class="card">
    <div class="card-header"><h2 class="card-title">Clustering Metrics</h2></div>
    <div class="card-body">
      <div class="metrics">
        <div class="metric-card">
          <h3>Best Rand Index (RI)</h3>
          <div class="metric-value">{{ bestRI }}</div>
        </div>
        <div class="metric-card">
          <h3>Clusters (last window)</h3>
          <div class="metric-value">{{ lastClusterCount }}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Similarity graph images ────────────────────────────────── -->
  <div class="card">
    <div class="card-header"><h2 class="card-title">Similarity Graphs</h2></div>
    <div class="card-body">
      <div class="image-container">
        <!-- v-for renders one <img> per filename returned by the API -->
        <img
          v-for="f in imageFiles"
          :key="f"
          :src="`/static/images/${f}?t=${cacheBust}`"
          alt="Cluster similarity graph"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject, onUnmounted } from 'vue'

// ── Notification (provided by App.vue) ────────────────────────────────────────
const notify = inject('notify')

// ── Form state ────────────────────────────────────────────────────────────────
const dataFile     = ref(null)
const labelFile    = ref(null)
const windowLength = ref(50)

// ── Analysis state ────────────────────────────────────────────────────────────
const statusText   = ref('Waiting for data…')
const statusType   = ref('idle')
const windowsDone  = ref(0)
const windowsTotal = ref(0)
const events       = ref({ emerging: [], drift: [], forgetting: [], stable: [] })
const riValues     = ref([])
const clusterNums  = ref([])
const imageFiles   = ref([])
const cacheBust    = ref(Date.now())

// ── Computed helpers ──────────────────────────────────────────────────────────
const progressPct = computed(() =>
  windowsTotal.value ? Math.round((windowsDone.value / windowsTotal.value) * 100) : 0
)
const bestRI = computed(() =>
  riValues.value.length ? Math.max(...riValues.value).toFixed(4) : '–'
)
const lastClusterCount = computed(() =>
  clusterNums.value.length ? clusterNums.value[clusterNums.value.length - 1] : '–'
)
const eventSum = arr => (arr || []).reduce((a, b) => a + b, 0)

// ── Polling timer ─────────────────────────────────────────────────────────────
let pollTimer = null

// Clean up the timer when user navigates away from this page
onUnmounted(() => clearInterval(pollTimer))

// ── Actions ───────────────────────────────────────────────────────────────────

async function startAnalysis() {
  if (!dataFile.value || !labelFile.value) {
    notify('Please select both a data file and a label file.', 'error')
    return
  }

  statusText.value = 'Uploading and starting analysis…'
  statusType.value = 'processing'

  // FormData lets us send files + text fields in a single POST request
  const form = new FormData()
  form.append('data_file',     dataFile.value)
  form.append('label_file',    labelFile.value)
  form.append('window_length', windowLength.value)

  try {
    const res  = await fetch('/api/run', { method: 'POST', body: form })
    const data = await res.json()
    if (data.error) throw new Error(data.error)

    windowsTotal.value = data.total_windows
    windowsDone.value  = 0
    notify(`Analysis started — ${data.total_windows} windows.`)

    // Poll every 1.5 s until completed or error
    pollTimer = setInterval(pollStatus, 1500)
  } catch (err) {
    statusText.value = 'Error: ' + err.message
    statusType.value = 'error'
    notify(err.message, 'error')
  }
}

async function pollStatus() {
  try {
    const res  = await fetch('/api/status')
    const data = await res.json()

    windowsDone.value  = data.windows_processed
    windowsTotal.value = data.total_windows

    if (data.cluster_nums)  clusterNums.value = data.cluster_nums
    if (data.ri_values)     riValues.value    = data.ri_values
    if (data.events)        events.value      = data.events
    if (data.image_files) {
      imageFiles.value = data.image_files
      cacheBust.value  = Date.now()
    }

    if (data.status === 'completed') {
      clearInterval(pollTimer)
      statusText.value = 'Analysis complete!'
      statusType.value = 'complete'
      notify('Analysis complete!', 'success')
    } else if (data.status === 'error') {
      clearInterval(pollTimer)
      statusText.value = 'Error: ' + (data.error || 'unknown')
      statusType.value = 'error'
      notify(data.error || 'An error occurred.', 'error')
    } else {
      statusText.value = 'Processing…'
    }
  } catch (err) {
    console.error('Poll error:', err)
  }
}

async function clearData() {
  clearInterval(pollTimer)
  await fetch('/api/clear', { method: 'POST' })

  // Reset all reactive state
  imageFiles.value   = []
  riValues.value     = []
  clusterNums.value  = []
  events.value       = { emerging: [], drift: [], forgetting: [], stable: [] }
  windowsDone.value  = 0
  windowsTotal.value = 0
  statusText.value   = 'Cleared.'
  statusType.value   = 'idle'
  notify('Data cleared.')
}
</script>
