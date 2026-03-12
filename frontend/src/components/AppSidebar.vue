<template>
  <!-- Sidebar navigation -->
  <nav class="sidebar">
    <div class="sidebar-header">
      <h2>CED-FS</h2>
    </div>
    <ul class="sidebar-menu">
      <li
        v-for="item in navItems"
        :key="item.name"
        class="sidebar-item"
        :class="{ active: isActive(item.path) }"
      >
        <!-- RouterLink gives us client-side navigation without page reload -->
        <RouterLink :to="item.path">
          <i :class="['fas', item.icon]"></i>
          {{ item.label }}
        </RouterLink>
      </li>
    </ul>
  </nav>

  <!-- Toggle button (outside the sidebar so it's always visible) -->
  <div class="sidebar-toggle" @click="$emit('toggle')">
    <i class="fas fa-chevron-left"></i>
  </div>
</template>

<script setup>
import { RouterLink, useRoute } from 'vue-router'

// Emit 'toggle' up to App.vue when the user clicks the collapse button
defineEmits(['toggle'])

const route = useRoute()

const navItems = [
  { name: 'home',          path: '/',              icon: 'fa-home',          label: 'Data Input' },
  { name: 'parameters',    path: '/parameters',    icon: 'fa-sliders-h',     label: 'Parameters' },
  { name: 'visualization', path: '/visualization', icon: 'fa-chart-bar',     label: 'Visualization' },
  { name: 'help',          path: '/help',          icon: 'fa-question-circle', label: 'Help' },
]

// Returns true when the current URL matches the nav item's path
function isActive(path) {
  return path === '/'
    ? route.path === '/'
    : route.path.startsWith(path)
}
</script>
