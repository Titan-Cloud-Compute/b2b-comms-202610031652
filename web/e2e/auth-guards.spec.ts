/**
 * Auth guard integration tests.
 *
 * Verifies:
 *  - unauthenticated visits to guarded routes redirect to /#/login?returnUrl=…
 *  - a USER is blocked from admin routes and sent to /#/dashboard
 *  - a MANAGER signs in, sees "Manager" role label, and survives a reload
 *  - an ADMIN reaches /#/admin/overview
 *
 * All /api/** calls are mocked — nothing reaches the network.
 * serviceWorkers:'block' prevents ngsw-worker from intercepting page.route mocks.
 */
import { test, expect, type Page } from '@playwright/test';

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
      const role = /admin/i.test(email) ? 'ADMIN' : /manager/i.test(email) ? 'MANAGER' : 'USER';
      store.user = { id: '1', email, role };
      return json(store.user);
    }
    if (method === 'GET' && apiPath === 'users/me') {
      return store.user ? json(store.user) : json({ message: 'Unauthorized' }, 401);
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

test('unauthenticated visit to guarded routes redirects to login with returnUrl', async ({ page }) => {
  // Visit /#/dashboard unauthenticated → should land on /#/login with returnUrl
  await page.goto('/#/dashboard');
  await expect(page).toHaveURL(/#\/login/, { timeout: 10_000 });
  expect(page.url()).toMatch(/returnUrl/);

  // Visit /#/admin/overview unauthenticated → should land on /#/login, sidebar absent
  await page.goto('/#/admin/overview');
  await expect(page).toHaveURL(/#\/login/, { timeout: 10_000 });
  await expect(page.locator('aside.sidebar')).toHaveCount(0);
});

test('USER visiting admin/overview is redirected to dashboard', async ({ page }) => {
  await loginAs(page, 'user@demo.local');
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });

  await page.goto('/#/admin/overview');
  await page.waitForLoadState('networkidle');
  expect(page.url()).toMatch(/#\/dashboard/);
});

test('MANAGER signs in, sees Manager role label, survives reload with MANAGER role in storage', async ({ page }) => {
  await loginAs(page, 'manager@demo.local');
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });

  // Sidebar should show "Manager" role label
  await expect(page.locator('aside.sidebar')).toBeVisible();
  await expect(page.locator('aside.sidebar')).toContainText('Manager');

  // Reload and verify role is preserved in localStorage
  await page.reload();
  await page.waitForLoadState('networkidle');

  const storedRole = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k === 'user' || k.endsWith(':user'));
    if (!key) return null;
    try { return (JSON.parse(localStorage.getItem(key) ?? 'null') as { role?: string } | null)?.role ?? null; }
    catch { return null; }
  });
  expect(storedRole).toBe('MANAGER');

  // URL still on dashboard
  expect(page.url()).toMatch(/#\/dashboard/);
});

test('ADMIN signs in and reaches admin/overview with sidebar visible', async ({ page }) => {
  await loginAs(page, 'admin@demo.local');
  await expect(page).toHaveURL(/#\/admin\/overview/, { timeout: 10_000 });
  await expect(page.locator('aside.sidebar')).toBeVisible();
});
