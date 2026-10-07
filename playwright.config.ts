import { defineConfig, devices } from '@playwright/test';

/**
 * Browser measurements of the built player (dist/cdn/v1.js) in real
 * Chromium. Run `pnpm build` first. The tests serve their own page and a
 * mock API through request routing, so no server is needed.
 */
export default defineConfig({
	testDir: 'tests/browser',
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? [['list'], ['github']] : 'list',
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
