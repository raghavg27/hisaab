import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { admin, deleteUser, makeUser, sheet, signIn } from './helpers';

/** Types an amount on the custom keypad inside the open sheet. */
export async function keypad(page: Page, amount: number) {
  const s = sheet(page);
  for (let i = 0; i < 8; i++) await s.getByRole('button', { name: 'Delete digit' }).click();
  for (const d of String(amount)) await s.getByRole('button', { name: d, exact: true }).click();
}

export const card = (page: Page, name: string) => page.getByRole('listitem', { name: new RegExp(`^${name},`) });

export async function stat(page: Page, label: string) {
  return page.locator('header').getByText(label, { exact: true }).locator('..').innerText();
}

/** Creates a group and starts the §5.6 night with the given players. Returns the session id. */
export async function startNight(page: Page, group: string, others: string[]) {
  await page.goto('/app/new');
  await page.getByRole('button', { name: 'New group' }).click();
  await sheet(page).getByLabel('Group name').fill(group);
  await sheet(page).getByRole('button', { name: 'Create' }).click();
  for (const n of others) {
    await page.getByPlaceholder('Type a name, press Enter').fill(n);
    await page.getByPlaceholder('Type a name, press Enter').press('Enter');
    await expect(page.getByRole('button', { name: n, pressed: true })).toBeVisible();
  }
  await page.getByRole('button', { name: /Start night/ }).click();
  await page.waitForURL(/\/app\/s\?id=/);
  return new URL(page.url()).searchParams.get('id')!;
}

/** §5.6 steps 2–7 on the Live Table. */
export async function playGolden(page: Page) {
  // 2. Rohit takes a short of ₹300 (Short → Custom → 300 → Confirm)
  await card(page, 'Rohit').getByRole('button', { name: 'Short' }).click();
  await sheet(page).getByRole('button', { name: 'Custom' }).click();
  await keypad(page, 300);
  await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
  // 3. Kunal tops up ₹500 (2 taps)
  await card(page, 'Kunal').getByRole('button', { name: 'Top-up' }).click();
  await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
  // 4. Rohit repays ₹200 cash
  await card(page, 'Rohit').getByRole('button', { name: /More/ }).click();
  await sheet(page).getByRole('button', { name: /Repay short/ }).click();
  await sheet(page).getByRole('button', { name: 'Custom' }).click();
  await keypad(page, 200);
  await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
  // 5. Sana leaves with 900 chips, bank pays her ₹900
  await card(page, 'Sana').getByRole('button', { name: /More/ }).click();
  await sheet(page).getByRole('button', { name: 'Leave table' }).click();
  await keypad(page, 900);
  await sheet(page).getByRole('button', { name: 'Next' }).click();
  await expect(sheet(page).getByText('Bank pays Sana')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Settled ✓' }).click();
  // 6. Sana rejoins
  await page.getByRole('button', { name: /Left the table/ }).click();
  await page.getByRole('button', { name: 'Rejoin' }).click();
  await expect(card(page, 'Sana')).toBeVisible();
  // 7. Priya takes a short of ₹200 (quick amount)
  await card(page, 'Priya').getByRole('button', { name: 'Short' }).click();
  await sheet(page).getByRole('button', { name: '₹200', exact: true }).click();
  await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
  await expect(sheet(page)).toBeHidden();
}

export async function countAll(page: Page, counts: Record<string, number>) {
  await page.getByRole('button', { name: 'End game' }).click();
  await sheet(page).getByRole('button', { name: 'Start counting' }).click();
  await page.waitForURL(/\/app\/s\/count/);
  const first = Object.keys(counts)[0]!;
  await page.getByRole('button', { name: new RegExp(`^${first}`) }).click();
  // Saving jumps to the next uncounted player in seat order.
  for (const [, amount] of Object.entries(counts)) {
    await keypad(page, amount);
    await sheet(page).getByRole('button', { name: /^Save/ }).click();
  }
}

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
  });
});
