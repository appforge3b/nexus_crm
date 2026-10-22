import { createApp } from './app.js';

// If hostname starts with 'scrm' (or URL contains ?empty=1), run in clean/empty mode for business use.
// Otherwise, run in demo mode with sample records.
const isCleanInstance =
  window.location.hostname.includes('scrm') ||
  new URLSearchParams(window.location.search).has('empty');

const app = createApp({
  root: document.getElementById('app'),
  storage: localStorage,
  clock: { now: () => new Date() },
  seed: !isCleanInstance,
  storageKey: isCleanInstance ? 'nexus_scrm_data' : 'nexus_data',
  demoMode: !isCleanInstance,
});

app.start();
