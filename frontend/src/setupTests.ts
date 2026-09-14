/// <reference types="vitest/jsdom" />
import '@testing-library/jest-dom/vitest'

// Node 25 and later put a localStorage of their own on globalThis, which stays undefined unless node
// runs with --localstorage-file, and it hides the one jsdom brings. The quiz keeps its run in
// storage, so the tests hand the page jsdom's.
if (globalThis.localStorage === undefined) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: jsdom.window.localStorage })
}
