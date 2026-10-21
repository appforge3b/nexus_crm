import { createApp } from './app.js';

const app = createApp({
  root: document.getElementById('app'),
  storage: localStorage,
  clock: { now: () => new Date() },
  seed: true,
});

app.start();
