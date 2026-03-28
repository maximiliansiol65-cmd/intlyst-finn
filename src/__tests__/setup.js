import "@testing-library/jest-dom";

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock fetch globally
global.fetch = vi.fn();

// Silence React Router future-flag warnings
const originalWarn = console.warn.bind(console);
beforeAll(() => {
  console.warn = (...args) => {
    if (typeof args[0] === "string" && args[0].includes("React Router")) return;
    originalWarn(...args);
  };
});
afterAll(() => { console.warn = originalWarn; });
