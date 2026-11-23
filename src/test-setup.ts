import { cleanup } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach } from 'vitest'

// Testing Library's auto-cleanup only self-registers when Vitest globals are
// enabled; they are not, so unmount between tests explicitly.
afterEach(cleanup)

// A fresh store per test. Without this the history store would carry an open
// database from one test into the next, which is exactly the leak the module
// singleton it replaced used to have.
beforeEach(() => {
  setActivePinia(createPinia())
})

/**
 * jsdom 31 parses `<dialog>` but implements none of its behaviour, so a
 * component calling `showModal()` throws under test while working in every
 * browser. This stands in for the parts a test can observe — the `open`
 * attribute and the `close` event — and nothing else: no top layer, no focus
 * trap, no Esc. Drop it once jsdom ships the real thing.
 */
function stubDialogElement(): void {
  // Chart transforms run under the node environment, which has no DOM at all.
  if (typeof HTMLDialogElement === 'undefined') return
  const dialog = HTMLDialogElement.prototype
  if (typeof dialog.showModal === 'function') return
  dialog.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  dialog.close = function close(this: HTMLDialogElement, returnValue?: string) {
    this.removeAttribute('open')
    if (returnValue !== undefined) this.returnValue = returnValue
    this.dispatchEvent(new Event('close'))
  }
}

stubDialogElement()
