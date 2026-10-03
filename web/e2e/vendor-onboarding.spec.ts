/**
 * Story: vendor-onboarding — hermetic e2e.
 * A new vendor submits company profile + contact details, lands on the vendor
 * dashboard, uploads a compliance document and sees it with "Pending review".
 * All /api/** calls are mocked.
 */
import { test, expect, type Page } from '@playwright/test';

async function mockApi(page: Page): Promise<void> {
  const store: {
    user: { id: string; email: string; role: string } | null;
    profile: Record<string, unknown> | null;
    docs: Record<string, unknown>[];
  } = { user: null, profile: null, docs: [] };
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
      store.user = { id: '1', email: body.email ?? '', role: 'USER' };
      return json(store.user);
    }
    if (method === 'GET' && apiPath === 'users/me') {
      return store.user ? json(store.user) : json({ message: 'Unauthorized' }, 401);
    }
    if (method === 'GET' && apiPath === 'vendor/profile') return json({ profile: store.profile });
    if (method === 'PUT' && apiPath === 'vendor/profile') {
      const body = JSON.parse(req.postData() || '{}') as Record<string, unknown>;
      store.profile = { id: 'vp1', ...body, completedAt: new Date().toISOString() };
      return json({ profile: store.profile });
    }
    if (method === 'GET' && apiPath === 'vendor/documents') return json(store.docs);
    if (method === 'POST' && apiPath === 'vendor/documents') {
      const doc = { id: `d${store.docs.length + 1}`, filename: 'insurance-certificate.pdf', status: 'PENDING_REVIEW', uploadedAt: new Date().toISOString() };
      store.docs.unshift(doc);
      return json(doc, 201);
    }
    if (method === 'POST' && apiPath === 'auth/logout') return json({ ok: true });
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => { await mockApi(page); });

test('new vendor submits profile, reaches dashboard, uploads a document pending review', async ({ page }) => {
  await page.goto('/#/login');
  await page.locator('#email').fill('vendor@demo.local');
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });

  // Dashboard is gated until the profile is complete.
  await page.goto('/#/vendor/dashboard');
  await expect(page).toHaveURL(/#\/vendor\/profile/, { timeout: 10_000 });
  await expect(page.getByTestId('vendor-profile-form')).toBeVisible();

  await page.getByTestId('vendor-company-input').fill('Acme Supplies');
  await page.getByTestId('vendor-contact-name-input').fill('Jane Doe');
  await page.getByTestId('vendor-contact-email-input').fill('jane@acme.test');
  await page.getByTestId('vendor-profile-submit').click();

  await expect(page).toHaveURL(/#\/vendor\/dashboard/, { timeout: 10_000 });
  await expect(page.getByTestId('vendor-company-name')).toContainText('Acme Supplies');
  await expect(page.getByTestId('vendor-profile-form')).toHaveCount(0);

  await page.getByTestId('vendor-document-upload').setInputFiles({
    name: 'insurance-certificate.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test'),
  });
  const row = page.getByTestId('vendor-document-row').first();
  await expect(row.getByTestId('vendor-document-status')).toHaveText('Pending review');

  // Survives a reload (library is loaded from the API).
  await page.reload();
  await expect(page.getByTestId('vendor-document-row').first().getByTestId('vendor-document-status')).toHaveText('Pending review');
});
