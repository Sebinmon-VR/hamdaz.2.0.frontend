/**
 * Whole features switched off in code, for everyone.
 *
 * Agents are paused (2026-10-17): still being built, so for a while nobody
 * sees them — no menu item, no companion in the bar, no calls to /agents, and
 * the /agents pages say they are paused. The backend matches this with
 * `ENABLED` in app/agents/__init__.py, which stops serving /agents at all.
 * Turn both back on together.
 */
export const AGENTS_ENABLED = false;
