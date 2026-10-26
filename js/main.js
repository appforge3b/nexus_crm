import { createApp } from './app.js';
import { bootCloud } from './boot.js';

// scrm.* (and any host after ?mode=cloud) runs the multi-tenant app with Google sign-in and server sync.
// Otherwise NEXUS runs entirely in this browser: the seeded demo, or a clean local copy with ?empty=1.
const params = new URLSearchParams(window.location.search);
if (params.get('mode') === 'cloud') localStorage.setItem('nexus:mode', 'cloud');
if (params.get('mode') === 'local') localStorage.removeItem('nexus:mode');

const root = document.getElementById('app');
const clock = { now: () => new Date() };
const isCloud = window.location.hostname.includes('scrm') || localStorage.getItem('nexus:mode') === 'cloud';

if (isCloud) {
  bootCloud({ root, storage: localStorage, clock });
} else {
  const isCleanInstance = params.has('empty');
  createApp({
    root,
    storage: localStorage,
    clock,
    seed: !isCleanInstance,
    storageKey: isCleanInstance ? 'nexus_scrm_data' : 'nexus_data',
    demoMode: !isCleanInstance,
  }).start();
}
