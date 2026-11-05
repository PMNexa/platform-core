import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// Tables remember their state in localStorage (`persistKey`); start every
// test with nothing remembered.
afterEach(() => {
  (globalThis as { localStorage?: { clear(): void } }).localStorage?.clear();
});
