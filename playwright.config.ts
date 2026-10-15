import { defineConfig, devices } from '@playwright/test';

// The Mac app runs in WebKit (WKWebView); Windows runs in Chromium (WebView2). Test both.
// The default window is 1440 × 900.
const viewport = { width: 1440, height: 900 };

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  // Shared CI runners stall now and then; a test that fails, then passes on a retry, is reported as flaky.
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:1420', viewport, trace: 'retain-on-failure' },
  // The default projects are silent: UI tests use the FakeEngine (?fake-audio) and the timing tests render
  // offline into memory. Tests tagged @audio use the real engine and speakers: run them with `npm run e2e:audio`.
  projects: [
    { name: 'chromium', grepInvert: /@audio/, use: { ...devices['Desktop Chrome'], viewport, launchOptions: { args: ['--mute-audio'] } } },
    { name: 'webkit', grepInvert: /@audio/, use: { ...devices['Desktop Safari'], viewport } },
    { name: 'audio-chromium', grep: /@audio/, use: { ...devices['Desktop Chrome'], viewport, launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } } },
    { name: 'audio-webkit', grep: /@audio/, use: { ...devices['Desktop Safari'], viewport } },
  ],
  webServer: { command: 'npm run dev', url: 'http://localhost:1420', reuseExistingServer: true, timeout: 60_000 },
});
