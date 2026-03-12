<template>
  <!-- Whole-page layout: sidebar + page content -->
  <div :class="['layout', { 'sidebar-collapsed': sidebarCollapsed }]">
    <AppSidebar :collapsed="sidebarCollapsed" @toggle="toggleSidebar" />

    <div class="main-content">
      <div class="container">
        <!-- router-view renders the current page component -->
        <router-view />
      </div>
    </div>
  </div>

  <!-- Global toast notification, shown by any child via inject('notify') -->
  <div :class="['notification', `notification-${notif.type}`, { show: notif.visible }]">
    {{ notif.message }}
  </div>
</template>

<script setup>
import { reactive, ref, provide } from 'vue'
import AppSidebar from './components/AppSidebar.vue'

// ── Sidebar collapse ─────────────────────────────────────────────────────────
const sidebarCollapsed = ref(localStorage.getItem('sidebar-collapsed') === 'true')

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem('sidebar-collapsed', sidebarCollapsed.value)
}

// ── Global notification system ───────────────────────────────────────────────
// Any child component can call: const notify = inject('notify'); notify('msg', 'success')
const notif = reactive({ message: '', type: 'success', visible: false })
let notifTimer = null

function notify(message, type = 'success') {
  clearTimeout(notifTimer)
  notif.message = message
  notif.type    = type
  notif.visible = true
  notifTimer = setTimeout(() => { notif.visible = false }, 3500)
}

// Make notify() available to all descendant components
provide('notify', notify)
</script>
