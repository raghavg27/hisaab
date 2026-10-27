import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { admin, deleteUser, makeUser, sheet, signIn } from './helpers';
import { countAll, playGolden, startNight } from './night';

test.describe('full night (§14.3 #1)', () => {
  let userId = '';
  test.afterAll(async () => userId && deleteUser(userId));

  test('setup, §5.6 sequence, count, settle, share, close', async ({ page, context }) => {
    const u = await makeUser('Amit');
    userId = u.userId;
    await signIn(context, u.session);
    await context.addInitScript(() => {
      (window as unknown as { __shared: string[] }).__shared = [];
      Object.defineProperty(navigator, 'share', {
        value: async (d: { text?: string }) => (window as unknown as { __shared: string[] }).__shared.push(d.text ?? ''),
      });
    });

    const id = await startNight(page, 'Diwali Gang', ['Rohit', 'Priya', 'Kunal', 'Sana']);
    await expect(page.getByText('Bank should now hold ₹2,500 (5 × ₹500)')).toBeVisible();
    await playGolden(page);

    // Amounts roll digit by digit, so read their spoken labels.
    const header = page.locator('header');
    await expect(header.getByRole('button', { name: 'Bank 2800 rupees' })).toBeVisible();
    await expect(header.getByText('3100 rupees', { exact: true })).toBeAttached();
    await expect(header.getByRole('button', { name: 'Shorts out 300 rupees' })).toBeVisible();

    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(a11y.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target} ${n.failureSummary}`))).toEqual([]);

    await countAll(page, { Amit: 300, Rohit: 1200, Priya: 0, Kunal: 1000, Sana: 600 });
    await expect(page.getByText('Everything matches — ₹3,100')).toBeVisible();
    await page.getByRole('button', { name: 'Settle' }).click();
    await page.waitForURL(/\/app\/s\/settle/);
    await page.getByRole('dialog', { name: 'Results' }).click(); // skip reveal

    const transfers = page.getByRole('heading', { name: 'Who pays whom' }).locator('..').getByRole('listitem');
    await expect(transfers).toHaveText([/Amit → Rohit\s*₹1,100/, /Amit → Kunal\s*₹1,000/, /Amit → Sana\s*₹400/, /Priya → Sana\s*₹200/]);

    await page.getByRole('button', { name: 'Share on WhatsApp' }).click();
    const shared = await page.evaluate(() => (window as unknown as { __shared: string[] }).__shared[0]);
    expect(shared).toContain('Buy-in ₹500 · 5 players');
    expect(shared).toContain(['Results', 'Sana +₹500', 'Rohit +₹400', 'Kunal ₹0', 'Amit −₹200', 'Priya −₹700'].join('\n'));
    expect(shared).toContain(['Who pays whom', 'Amit → Rohit ₹1,100', 'Amit → Kunal ₹1,000', 'Amit → Sana ₹400', 'Priya → Sana ₹200'].join('\n'));

    await page.getByRole('button', { name: 'Close night' }).click();
    await expect(page.getByRole('button', { name: 'Reopen night' })).toBeVisible();

    // Everything reached the server and the night was verified.
    await expect
      .poll(async () => (await admin().from('sessions').select('status, verified_at').eq('id', id).single()).data, { timeout: 30_000 })
      .toMatchObject({ status: 'closed', verified_at: expect.any(String) });

    // Verified results feed the group leaderboard and personal history (§8.14).
    const { data: s } = await admin().from('sessions').select('group_id').eq('id', id).single();
    await page.goto(`/app/g?id=${s!.group_id}`);
    await page.getByRole('tab', { name: 'Leaderboard' }).click();
    const rows = page.getByRole('table').getByRole('row');
    await expect(rows).toHaveCount(6);
    await expect(rows.nth(1)).toContainText(/Sana\s*\+₹500\s*1\s*1\s*₹500\s*1/);
    await expect(rows.nth(5)).toContainText(/Priya\s*−₹700\s*1\s*0/);

    await page.goto('/app/history');
    await expect(page.getByText('Nights played').locator('..')).toContainText('1');
    await expect(page.getByRole('link', { name: /Diwali Gang/ })).toContainText('−₹200');
  });
});
