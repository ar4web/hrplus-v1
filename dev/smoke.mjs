// End-to-end smoke test: signs in as each demo role, walks every route and
// reports console errors, page exceptions and failed /api calls.
// Usage: node dev/smoke.mjs [role]   (assumes npm run dev:all is running)
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173';
const ROUTES = ['/', '/attendance', '/leave', '/directory', '/payroll', '/timesheets', '/invoices', '/expenses', '/assets', '/documents', '/chat', '/company', '/policies', '/support', '/settings'];
const ROLES = process.argv[2] ? [process.argv[2]] : ['admin', 'employee', 'vendor'];
const SHOTS = '.data/shots';
fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
const failures = [];

function track(page, role, route) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon|Download the React DevTools|was preloaded using link preload/i.test(t)) return;
    errors.push(`[${role} ${route}] console: ${t.slice(0, 400)}`);
  });
  page.on('pageerror', (e) => errors.push(`[${role} ${route}] exception: ${String(e).slice(0, 400)}`));
  page.on('response', async (r) => {
    const u = r.url();
    if (!u.includes('/api/')) return;
    if (r.status() >= 400) {
      let body = '';
      try { body = (await r.text()).slice(0, 200); } catch { /* ignore */ }
      failures.push(`[${role} ${route}] ${r.status()} ${u.replace(BASE, '')} ${body}`);
    }
  });
}

const browser = await chromium.launch();
let total = 0;

for (const role of ROLES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  track(page, role, 'login');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  try {
    await page.locator('button').filter({ hasText: new RegExp(`^\\s*${role}\\s*$`, 'i') }).first().click();
    await page.locator('button').filter({ hasText: new RegExp(`Use demo ${role} account`, 'i') }).first().click();
    await page.locator('button').filter({ hasText: new RegExp(`Sign in as ${role}`, 'i') }).first().click();
    await page.waitForFunction(() => !document.body.innerText.includes('Sign in to HRplus'), { timeout: 20000 });
  } catch (e) {
    errors.push(`[${role}] login failed: ${String(e.message).slice(0, 300)}`);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/${role}-login.png`, fullPage: false });

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    total++;
    const name = route === '/' ? 'dashboard' : route.slice(1);
    await page.screenshot({ path: `${SHOTS}/${role}-${name}.png`, fullPage: false });
    const bodyText = await page.innerText('body').catch(() => '');
    if (!bodyText || bodyText.trim().length < 40) errors.push(`[${role} ${route}] blank page`);
    if (/Something went wrong|Unhandled|Cannot read prop/i.test(bodyText)) errors.push(`[${role} ${route}] error UI: ${bodyText.slice(0, 200)}`);
  }
  await ctx.close();
}

// ---- error boundary ----
// /?crash=1 throws on purpose (dev only), so this proves the boundary catches a
// render error instead of leaving a blank page — and that navigating away recovers.
let boundary = 'not run';
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (/render error|Dev crash switch/i.test(m.text())) console.log(`  (expected) ${m.text().slice(0, 120)}`); });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.locator('button').filter({ hasText: /^\s*admin\s*$/i }).first().click();
    await page.locator('button').filter({ hasText: /Use demo admin account/i }).first().click();
    await page.locator('button').filter({ hasText: /Sign in as admin/i }).first().click();
    await page.waitForFunction(() => !document.body.innerText.includes('Sign in to HRplus'), { timeout: 20000 });

    await page.goto(BASE + '/?crash=1', { waitUntil: 'domcontentloaded' });
    const shown = await page.locator('[data-testid="error-boundary"]').first().isVisible({ timeout: 8000 }).catch(() => false);
    const bodyText = await page.innerText('body').catch(() => '');
    if (!shown) throw new Error(`boundary did not render (body: ${bodyText.slice(0, 120)})`);

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const recovered = await page.locator('[data-testid="error-boundary"]').count() === 0
      && (await page.innerText('body')).length > 200;
    if (!recovered) throw new Error('app did not recover after navigating away from the crash');
    boundary = 'caught the render error and recovered on navigation';
    await page.screenshot({ path: `${SHOTS}/error-boundary.png` });
  } catch (e) {
    boundary = `FAILED: ${String(e.message).slice(0, 200)}`;
    errors.push(`[error boundary] ${String(e.message).slice(0, 200)}`);
  }
  await ctx.close();
}

await browser.close();

const uniq = (arr) => [...new Set(arr)];
console.log(`\nChecked ${total} page loads across ${ROLES.join(', ')}`);
console.log(`Error boundary: ${boundary}`);
console.log(`\n=== CONSOLE / PAGE ERRORS (${uniq(errors).length}) ===`);
console.log(uniq(errors).join('\n') || 'none');
console.log(`\n=== FAILED API CALLS (${uniq(failures).length}) ===`);
console.log(uniq(failures).join('\n') || 'none');
fs.writeFileSync('.data/smoke-report.txt', [...uniq(errors), '', ...uniq(failures)].join('\n'));
process.exit(uniq(errors).length || uniq(failures).length ? 1 : 0);
