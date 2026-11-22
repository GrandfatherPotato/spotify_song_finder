import { createRouter, createWebHistory } from 'vue-router'
import { ROUTE_NAME, ROUTE_PATH, documentTitle } from './routes'
import { hasStoredTokens } from './spotify/tokens'
import CallbackView from './views/CallbackView.vue'
import FinderView from './views/FinderView.vue'
import HistoryImportView from './views/HistoryImportView.vue'
import HistoryOverviewView from './views/HistoryOverviewView.vue'
import HistoryView from './views/HistoryView.vue'
import HomeView from './views/HomeView.vue'
import SignInView from './views/SignInView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: ROUTE_PATH.home, name: ROUTE_NAME.home, component: HomeView },
    { path: ROUTE_PATH.signIn, name: ROUTE_NAME.signIn, component: SignInView },
    { path: ROUTE_PATH.callback, name: ROUTE_NAME.callback, component: CallbackView },
    {
      path: ROUTE_PATH.finder,
      name: ROUTE_NAME.finder,
      component: FinderView,
      meta: { requiresSession: true },
    },
    // No session required: the export is local data, nothing here calls Spotify.
    { path: ROUTE_PATH.history, name: ROUTE_NAME.history, component: HistoryImportView },
    {
      path: ROUTE_PATH.historyOverview,
      name: ROUTE_NAME.historyOverview,
      component: HistoryOverviewView,
    },
    { path: ROUTE_PATH.historyTest, name: ROUTE_NAME.historyTest, component: HistoryView },
    { path: '/:pathMatch(.*)*', redirect: ROUTE_PATH.home },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresSession === true && !hasStoredTokens()) return ROUTE_PATH.signIn

  return true
})

router.afterEach((to) => {
  document.title = documentTitle(to.name)
})
