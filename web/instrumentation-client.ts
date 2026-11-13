import posthog from 'posthog-js';
import { POSTHOG_TOKEN } from '../src/posthog-config.ts';

posthog.init(POSTHOG_TOKEN, {
  // Through our own domain (next.config.ts rewrites), so ad blockers don't drop events and replays.
  api_host: '/ingest',
  ui_host: 'https://us.posthog.com',
  defaults: '2026-08-30',
  capture_exceptions: true,
  capture_dead_clicks: true,
  enable_heatmaps: true,
  session_recording: { maskAllInputs: true, recordCrossOriginIframes: false },
  tracing_headers: [window.location.hostname],
  debug: process.env.NODE_ENV === 'development',
});
