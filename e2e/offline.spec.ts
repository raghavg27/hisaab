import { expect, test } from '@playwright/test';
import { admin, deleteUser, makeUser, sheet, signIn } from './helpers';
import { countAll, playGolden, startNight } from './night';

let userId = '';
test.afterAll(async () => userId && deleteUser(userId));

test('airplane mode from setup to settlement, then everything syncs (§14.3 #2)', async ({ page, context, browser }) => {
  const u = await makeUser('Amit');
  userId = u.userId;
  await signIn(context, u.session);

  // First visit online installs the service worker and caches the app shell.
  await page.goto('/app');
  await expect(page.getByText(/Namaste|Amit/).first()).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          const key = (await caches.keys()).find((k) => k.startsWith('shell-'));
          return key ? (await (await caches.open(key)).keys()).length : 0;
        }),
      { timeout: 30_000 },
    )
    .toBe(14);

  await context.setOffline(true);
  const id = await startNight(page, 'Airplane Gang', ['Rohit', 'Priya', 'Kunal', 'Sana']);
  await playGolden(page);
  await expect(page.getByRole('status').filter({ hasText: /Offline · \d+ to sync/ })).toBeVisible();

  await countAll(page, { Amit: 300, Rohit: 1200, Priya: 0, Kunal: 1000, Sana: 600 });
  await expect(page.getByText('Everything matches — ₹3,100')).toBeVisible();
  await page.getByRole('button', { name: 'Settle' }).click();
  await page.waitForURL(/\/app\/s\/settle/);
  await page.getByRole('dialog', { name: 'Results' }).click();
  const transfers = page.getByRole('heading', { name: 'Who pays whom' }).locator('..').getByRole('listitem');
  await expect(transfers).toHaveText([/Amit → Rohit\s*₹1,100/, /Amit → Kunal\s*₹1,000/, /Amit → Sana\s*₹400/, /Priya → Sana\s*₹200/]);
  await page.getByRole('button', { name: 'Close night' }).click();
  await expect(page.getByRole('button', { name: 'Reopen night' })).toBeVisible();
  expect(await admin().from('sessions').select('id').eq('id', id).maybeSingle()).toMatchObject({ data: null });

  // Back online: the outbox drains and the server verifies the night.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(async () => (await admin().from('sessions').select('status, verified_at').eq('id', id).maybeSingle()).data, { timeout: 45_000 })
    .toMatchObject({ status: 'closed', verified_at: expect.any(String) });
  // Every entry arrived, in order, with no gaps.
  const { data: events } = await admin().from('events').select('seq, type').eq('session_id', id).order('seq');
  expect(events!.map((e) => e.seq)).toEqual(events!.map((_, i) => i + 1));
  expect(events!.at(-1)!.type).toBe('SESSION_CLOSED');

  // A viewer sees the final state.
  const token = (await admin().from('sessions').select('view_token').eq('id', id).single()).data!.view_token as string;
  const viewer = await (await browser.newContext({ ...test.info().project.use })).newPage();
  await viewer.goto(`/v/${token}`);
  const viewerTransfers = viewer.getByRole('heading', { name: 'Who pays whom' }).locator('..').getByRole('listitem');
  await expect(viewerTransfers).toHaveText([/Amit → Rohit\s*₹1,100/, /Amit → Kunal\s*₹1,000/, /Amit → Sana\s*₹400/, /Priya → Sana\s*₹200/], {
    timeout: 20_000,
  });
  await viewer.context().close();
});
