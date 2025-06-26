import "@testing-library/jest-dom";
import { jest, beforeAll, afterAll } from "@jest/globals";

// Remove the jest namespace extension since we're not using jest-dom

// Mock window.vscodeApi
global.window = Object.create(window);
Object.defineProperty(window, "vscodeApi", {
  value: {
    postMessage: jest.fn() as jest.Mock,
  },
  writable: true,
});

// Suppress console errors in tests unless explicitly testing them
const originalError = console.error;
const originalWarn = console.warn;
beforeAll(() => {
  console.error = jest.fn() as jest.Mock;
  console.warn = jest.fn() as jest.Mock;
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});
