import { cleanup } from '@testing-library/vue'
import { afterEach } from 'vitest'

// Testing Library's auto-cleanup only self-registers when Vitest globals are
// enabled; they are not, so unmount between tests explicitly.
afterEach(cleanup)

/**
 * jsdom 31 parses `<dialog>` but implements none of its behaviour, so a
 * component calling `showModal()` throws under test while working in every
 * browser. This stands in for the parts a test can observe — the `open`
 * attribute and the `close` event — and nothing else: no top layer, no focus
 * trap, no Esc. Drop it once jsdom ships the real thing.
 */
function stubDialogElement(): void {
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
