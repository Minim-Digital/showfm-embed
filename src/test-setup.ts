/**
 * Unit test setup, carried over from the show.fm app's test setup: DOM
 * matchers, jest-axe matchers and the browser APIs jsdom lacks.
 */
import '@testing-library/jest-dom/vitest';
import { expect } from 'vitest';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations as unknown as Parameters<typeof expect.extend>[0]);

Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: (query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false
	})
});

window.scrollTo = () => {};

globalThis.ResizeObserver = class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
};
