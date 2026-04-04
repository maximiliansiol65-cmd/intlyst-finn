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
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: vi.fn(),
});

window.addEventListener("error", (event) => {
  const message = event?.error?.message || event?.message || "";
  if (String(message).includes("Test explosion")) {
    event.preventDefault();
  }
});

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
