import { cleanup } from '@testing-library/vue'
import { afterEach } from 'vitest'

// Testing Library's auto-cleanup only self-registers when Vitest globals are
// enabled; they are not, so unmount between tests explicitly.
afterEach(cleanup)
