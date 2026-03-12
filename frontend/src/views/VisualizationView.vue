<template>
  <h1>Visualization</h1>

  <!-- ── Concept evolution summary ──────────────────────────────── -->
  <div class="card">
    <div class="card-header"><h2 class="card-title">Concept Evolution Summary</h2></div>
    <div class="card-body">
      <!-- v-if / v-else: show table only when data is available -->
      <p v-if="!hasData">
        No analysis results yet. Run an analysis on the
        <RouterLink to="/">Data Input</RouterLink> page first.
      </p>
      <template v-else>
        <table class="summary-table">
          <thead><tr><th>Event type</th><th>Total count</th></tr></thead>
          <tbody>
            <tr><td>Emerging concepts</td>   <td>{{ eventSum(events.emerging)   }}</td></tr>
            <tr><td>Concept drift</td>       <td>{{ eventSum(events.drift)      }}</td></tr>
            <tr><td>Concept forgetting</td>  <td>{{ eventSum(events.forgetting) }}</td></tr>
            <tr><td>Stable (no evolution)</td><td>{{ eventSum(events.stable)   }}</td></tr>
          </tbody>
        </table>
        <p style="margin-top:10px">
          Best Rand Index: <strong>{{ bestRI }}</strong>
        </p>
      </template>
    </div>
  </div>

  <!-- ── Clusters per window bar chart ───────────────────────────── -->
  <div class="card">
    <div class="card-header"><h2 class="card-title">Clusters per Window</h2></div>
    <div class="card-body">
      <!-- ref="chartCanvas" lets us grab the DOM element in <script setup> -->
      <canvas ref="chartCanvas" height="80"></canvas>
    </div>
  </div>

  <!-- ── Similarity graph gallery ───────────────────────────────── -->
  <div class="card">
    <div class="card-header"><h2 class="card-title">Similarity Graph Gallery</h2></div>
    <div class="card-body">
      <div class="image-container">
        <img
          v-for="f in imageFiles"
          :key="f"
          :src="`/static/images/${f}?t=${cacheBust}`"
          alt="Similarity graph"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { RouterLink } from 'vue-router'

// ── State ─────────────────────────────────────────────────────────────────────
const events      = ref({ emerging: [], drift: [], forgetting: [], stable: [] })
const riValues    = ref([])
const clusterNums = ref([])
const imageFiles  = ref([])
const cacheBust   = ref(Date.now())

const hasData  = computed(() => clusterNums.value.length > 0)
const bestRI   = computed(() =>
  riValues.value.length ? Math.max(...riValues.value).toFixed(4) : '–'
)
const eventSum = arr => (arr || []).reduce((a, b) => a + b, 0)

// ── Canvas reference ─────────────────────────────────────────────────────────
// ref(null) + ref="chartCanvas" in template = direct access to <canvas> DOM element
const chartCanvas = ref(null)

// ── Load data on page mount ───────────────────────────────────────────────────
onMounted(async () => {
  try {
    const res  = await fetch('/api/status')
    const data = await res.json()
    if (!data || data.status === 'idle') return

    if (data.events)      events.value      = data.events
    if (data.ri_values)   riValues.value    = data.ri_values
    if (data.cluster_nums) clusterNums.value = data.cluster_nums
    if (data.image_files)  imageFiles.value  = data.image_files
    cacheBust.value = Date.now()

    // Wait for Vue to finish rendering the canvas before drawing
    await nextTick()
    drawBarChart()
  } catch (err) {
    console.error('Failed to load visualization data:', err)
  }
})

// Re-draw the chart whenever cluster data changes
watch(clusterNums, async () => {
  await nextTick()
  drawBarChart()
})

// ── Canvas bar chart (no external library) ────────────────────────────────────
function drawBarChart() {
  const canvas = chartCanvas.value
  if (!canvas || !clusterNums.value.length) return

  const ctx  = canvas.getContext('2d')
  const W    = (canvas.width = canvas.parentElement.offsetWidth)
  const H    = (canvas.height = 160)
  const pad  = 40
  const vals = clusterNums.value
  const maxV = Math.max(...vals) || 1
  const barW = Math.max(4, (W - pad * 2) / vals.length - 4)

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#4a90e2'

  vals.forEach((v, i) => {
    const x  = pad + i * ((W - pad * 2) / vals.length)
    const bh = ((H - pad * 2) * v) / maxV
    ctx.fillRect(x, H - pad - bh, barW, bh)
  })

  ctx.fillStyle = '#333'
  ctx.font = '11px Segoe UI'
  ctx.fillText('Window', pad, H - 5)
  ctx.fillText('Clusters', 0, pad)
}
</script>
