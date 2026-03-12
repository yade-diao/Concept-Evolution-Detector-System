import { createRouter, createWebHistory } from 'vue-router'
import HomeView          from '../views/HomeView.vue'
import ParametersView    from '../views/ParametersView.vue'
import VisualizationView from '../views/VisualizationView.vue'
import HelpView          from '../views/HelpView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',              component: HomeView,          name: 'home' },
    { path: '/parameters',    component: ParametersView,    name: 'parameters' },
    { path: '/visualization', component: VisualizationView, name: 'visualization' },
    { path: '/help',          component: HelpView,          name: 'help' },
  ],
})
