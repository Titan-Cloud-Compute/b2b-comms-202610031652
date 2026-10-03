/**
 * Story: shared-channel — hermetic e2e (static SPA, every /api/** mocked).
 *
 * A vendor (MANAGER) creates a shared channel with a customer (USER); the
 * channel shows up in both users' lists, and a message posted by the customer
 * appears in the thread. serviceWorkers:'block' so page.route sees fetches.
 */
import { test, expect, type Page } from '@playwright/test';

interface Store {
  channels: { id: string; name: string; createdById: string; createdAt: string; members: { userId: string; role: string; email: string }[] }[];
  messages: { id: string; channelId: string; authorId: string; authorName: string; body: string; createdAt: string }[];
}

const USERS: Record<string, { id: string; email: string; role: string }> = {
  'manager@demo.local': { id: 'u-vendor', email: 'manager@demo.local', role: 'MANAGER' },
  'user@demo.local': { id: 'u-cust', email: 'user@demo.local', role: 'USER' },
};

async function mockApi(page: Page, store: Store): Promise<void> {
  let current: { id: string; email: string; role: string } | null = null;
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname
      .replace(/^.*\/api\//, '').replace(/^api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const body = (): Record<string, unknown> => {
      try { return JSON.parse(req.postData() || '{}') as Record<string, unknown>; } catch { return {}; }
    };

    if (method === 'POST' && apiPath === 'auth/login') {
      current = USERS[String(body()['email'] ?? '')] ?? null;
      return current ? json(current) : json({ message: 'Invalid credentials' }, 401);
    }
    if (method === 'GET' && apiPath === 'users/me') {
      return current ? json(current) : json({ message: 'Unauthorized' }, 401);
    }
    if (!current) return json({ message: 'Unauthorized' }, 401);
    const me = current;

    if (method === 'GET' && apiPath === 'channels') {
      return json(store.channels.filter(c => c.members.some(m => m.userId === me.id)));
    }
    if (method === 'GET' && apiPath === 'channels/customers') {
      return json([{ id: 'u-cust', email: 'user@demo.local', name: 'Acme Customer' }]);
    }
    if (method === 'POST' && apiPath === 'channels') {
      if (me.role === 'USER') return json({ message: 'Forbidden' }, 403);
      const b = body();
      const ch = {
        id: `ch-${store.channels.length + 1}`,
        name: String(b['name']),
        createdById: me.id,
        createdAt: new Date().toISOString(),
        members: [
          { userId: me.id, role: 'VENDOR', email: me.email },
          ...((b['customerIds'] as string[]) ?? []).map(id => ({ userId: id, role: 'CUSTOMER', email: 'user@demo.local' })),
        ],
      };
      store.channels.push(ch);
      return json(ch, 201);
    }
    const m = /^channels\/([^/]+)(?:\/(messages|stream))?$/.exec(apiPath);
    if (m) {
      const ch = store.channels.find(c => c.id === m[1] && c.members.some(x => x.userId === me.id));
      if (!ch) return json({ message: 'channel not found' }, 404);
      if (!m[2] && method === 'GET') return json(ch);
      if (m[2] === 'stream') return route.fulfill({ status: 204, body: '' });
      if (m[2] === 'messages' && method === 'GET') return json(store.messages.filter(x => x.channelId === ch.id));
      if (m[2] === 'messages' && method === 'POST') {
        const msg = {
          id: `m-${store.messages.length + 1}`, channelId: ch.id, authorId: me.id, authorName: me.email,
          body: String(body()['body'] ?? ''), createdAt: new Date().toISOString(),
        };
        store.messages.push(msg);
        return json(msg, 201);
      }
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
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
}

test.use({ serviceWorkers: 'block' });

test('vendor creates a shared channel; customer sees it and posts a message', async ({ browser }) => {
  const store: Store = { channels: [], messages: [] };

  const vendorCtx = await browser.newContext({ serviceWorkers: 'block' });
  const vendor = await vendorCtx.newPage();
  await mockApi(vendor, store);
  await loginAs(vendor, 'manager@demo.local');

  await expect(vendor.locator('a', { hasText: 'Channels' }).first()).toBeVisible();
  await vendor.goto('/#/channels');
  await expect(vendor.locator('[data-testid="channel-list"]')).toBeVisible();
  await vendor.locator('[data-testid="channel-name"]').fill('Acme support');
  await vendor.locator('[data-testid="customer-u-cust"]').check();
  await vendor.locator('[data-testid="create-channel-submit"]').click();
  await expect(vendor).toHaveURL(/#\/channels\/ch-1/, { timeout: 10_000 });
  await expect(vendor.locator('[data-testid="channel-title"]')).toHaveText('Acme support');

  const custCtx = await browser.newContext({ serviceWorkers: 'block' });
  const customer = await custCtx.newPage();
  await mockApi(customer, store);
  await loginAs(customer, 'user@demo.local');
  await customer.goto('/#/channels');
  await expect(customer.locator('[data-testid="create-channel"]')).toHaveCount(0);
  const item = customer.locator('[data-testid="channel-item"]', { hasText: 'Acme support' });
  await expect(item).toBeVisible();
  await item.locator('a').click();
  await expect(customer).toHaveURL(/#\/channels\/ch-1/);
  await customer.locator('[data-testid="message-input"]').fill('Hello from the customer');
  await customer.locator('[data-testid="message-send"]').click();
  await expect(customer.locator('[data-testid="message-item"]')).toContainText('Hello from the customer');

  // Vendor's open channel picks the message up live (SSE, polling fallback).
  await expect(vendor.locator('[data-testid="message-item"]')).toContainText('Hello from the customer', { timeout: 15_000 });

  // Channel also listed for the vendor.
  await vendor.goto('/#/channels');
  await expect(vendor.locator('[data-testid="channel-item"]', { hasText: 'Acme support' })).toBeVisible();

  await vendorCtx.close();
  await custCtx.close();
});

test('unauthenticated visit to /channels redirects to login', async ({ page }) => {
  await mockApi(page, { channels: [], messages: [] });
  await page.goto('/#/channels');
  await expect(page).toHaveURL(/#\/login/, { timeout: 10_000 });
});
