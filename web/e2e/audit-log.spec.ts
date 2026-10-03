/**
 * Audit Log screen (/#/admin/audit-log).
 *
 * Verifies an ADMIN can open the Audit Log from the sidebar and sees mocked
 * audit rows newest first (system events show "System" as the user), and a
 * USER is bounced to the dashboard. All /api/** calls are mocked.
 */
import { test, expect, type Page } from '@playwright/test';

const AUDIT_ROWS = [
  { id: 'a1', actor: 'SYSTEM', actorUserId: null, actorEmail: null, action: 'system.startup',
    payloadJson: {}, createdAt: '2026-10-01T08:00:00.000Z' },
  { id: 'a2', actor: 'USER', actorUserId: 'u1', actorEmail: 'user@demo.local', action: 'auth.login',
    payloadJson: {}, createdAt: '2026-10-02T09:30:00.000Z' },
];

async function mockApi(page: Page): Promise<void> {
  const store: { user: { id: string; email: string; role: string } | null } = { user: null };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname
      .replace(/^.*\/api\//, '').replace(/^api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') {
      let body: { email?: string } = {};
      try { body = JSON.parse(req.postData() || '{}') as { email?: string }; } catch { /* ignore */ }
      const email = body.email ?? '';
      const role = /admin/i.test(email) ? 'ADMIN' : 'USER';
      store.user = { id: '1', email, role };
      return json(store.user);
    }
    if (method === 'GET' && apiPath === 'users/me') {
      return store.user ? json(store.user) : json({ message: 'Unauthorized' }, 401);
    }
    if (method === 'GET' && apiPath === 'admin/audit-log') {
      if (store.user?.role !== 'ADMIN') return json({ message: 'Forbidden' }, 403);
      return json({ rows: AUDIT_ROWS, total: AUDIT_ROWS.length, page: 1, pageSize: 50 });
    }
    if (method === 'POST' && apiPath === 'auth/logout') return json({ ok: true });
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/#/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
}

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => { await mockApi(page); });

test('ADMIN opens Audit Log from the sidebar and sees rows newest first', async ({ page }) => {
  await loginAs(page, 'admin@demo.local');
  await expect(page).toHaveURL(/#\/admin\/overview/, { timeout: 10_000 });

  const link = page.locator('aside.sidebar a[href*="admin/audit-log"]');
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/#\/admin\/audit-log/, { timeout: 10_000 });

  const rows = page.locator('[data-testid="audit-log-row"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('[data-testid="audit-log-action"]')).toHaveText('auth.login');
  await expect(rows.first().locator('[data-testid="audit-log-user"]')).toHaveText('user@demo.local');
  await expect(rows.nth(1).locator('[data-testid="audit-log-user"]')).toHaveText('System');
  await expect(page.locator('[data-testid="audit-log-table"]')).toContainText('System');
});

test('USER visiting admin/audit-log is redirected to dashboard', async ({ page }) => {
  await loginAs(page, 'user@demo.local');
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
  await page.goto('/#/admin/audit-log');
  await page.waitForLoadState('networkidle');
  expect(page.url()).toMatch(/#\/dashboard/);
  await expect(page.locator('[data-testid="audit-log-row"]')).toHaveCount(0);
});
