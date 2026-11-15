import { createRouter, createWebHistory } from 'vue-router'
import { ROUTE_NAME, ROUTE_PATH } from './routes'
import { hasStoredTokens } from './spotify/tokens'
import CallbackView from './views/CallbackView.vue'
import FinderView from './views/FinderView.vue'
import SignInView from './views/SignInView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: ROUTE_PATH.signIn, name: ROUTE_NAME.signIn, component: SignInView },
    { path: ROUTE_PATH.callback, name: ROUTE_NAME.callback, component: CallbackView },
    {
      path: ROUTE_PATH.finder,
      name: ROUTE_NAME.finder,
      component: FinderView,
      meta: { requiresSession: true },
    },
    { path: '/:pathMatch(.*)*', redirect: ROUTE_PATH.signIn },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresSession === true && !hasStoredTokens()) return ROUTE_PATH.signIn

  return true
})
