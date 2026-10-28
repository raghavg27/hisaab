import { expect, test, type Page } from '@playwright/test';
import { admin, deleteUser, makeUser, sheet, signIn } from './helpers';
import { card, keypad, startNight } from './night';

/**
 * A 15-person night on the host's phone, start to finish, with a viewer watching:
 * late arrivals, undo, typo guard, every kind of leave, rejoin, bank check, the bank holder
 * leaving, counting with a gap, settlement, close, reopen and re-close.
 */
const OTHERS = ['Rohit', 'Priya', 'Kunal', 'Sana', 'Vikram', 'Neha', 'Arjun', 'Pooja', 'Rahul', 'Simran', 'Karan', 'Anjali', 'Dev', 'Meera'];

const users: string[] = [];
test.afterAll(async () => Promise.all(users.map(deleteUser)));

async function more(page: Page, name: string, action: string | RegExp) {
  await card(page, name).getByRole('button', { name: /More/ }).click();
  await sheet(page).getByRole('button', { name: action }).click();
}

async function undo(page: Page, toast: string) {
  await page.getByRole('status').filter({ hasText: toast }).getByRole('button', { name: 'Undo' }).click();
}

async function totals(page: Page, bank: number, onTable: number, shorts: number) {
  const header = page.locator('header');
  await expect(header.getByRole('button', { name: `Bank ${bank} rupees` })).toBeVisible();
  await expect(header.getByText('On table', { exact: true }).locator('..').getByText(`${onTable} rupees`, { exact: true })).toBeAttached();
  await expect(header.getByRole('button', { name: `Shorts out ${shorts} rupees` })).toBeVisible();
}

test('a 15-person night, start to finish', async ({ page, context, browser }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const u = await makeUser('Amit');
  users.push(u.userId);
  await signIn(context, u.session);
  await context.addInitScript(() => {
    (window as unknown as { __shared: string[] }).__shared = [];
    Object.defineProperty(navigator, 'share', {
      value: async (d: { text?: string }) => (window as unknown as { __shared: string[] }).__shared.push(d.text ?? ''),
    });
  });

  // ── 12 sit down; 3 arrive late through "+ Player".
  const id = await startNight(page, 'Fifteen Gang', OTHERS.slice(0, 11));
  await expect(page.getByText('Bank should now hold ₹6,000 (12 × ₹500)')).toBeVisible();
  for (const name of OTHERS.slice(11)) {
    await page.getByRole('button', { name: 'Player', exact: true }).click();
    await sheet(page).getByLabel('Add person').fill(name);
    await sheet(page).getByRole('button', { name: 'Add person' }).click();
    await expect(card(page, name)).toBeVisible();
  }
  await expect(page.getByRole('list', { name: '15 players' }).getByRole('listitem')).toHaveCount(15);
  await totals(page, 7500, 7500, 0);

  // A 16th person added by mistake is undone straight away.
  await page.getByRole('button', { name: 'Player', exact: true }).click();
  await sheet(page).getByLabel('Add person').fill('Guest');
  await sheet(page).getByRole('button', { name: 'Add person' }).click();
  await expect(card(page, 'Guest')).toBeVisible();
  await undo(page, 'Guest joined');
  await expect(page.getByText('Undone')).toBeVisible();
  await expect(card(page, 'Guest')).toHaveCount(0);
  await totals(page, 7500, 7500, 0);

  // ── A viewer opens the live link.
  let token = '';
  await expect
    .poll(async () => (token = (await admin().from('sessions').select('view_token').eq('id', id).maybeSingle()).data?.view_token ?? ''), { timeout: 20_000 })
    .not.toBe('');
  const viewerContext = await browser.newContext({ ...test.info().project.use });
  await viewerContext.addInitScript(() => localStorage.setItem('hisaab-splash-day', new Date().toDateString()));
  const viewer = await viewerContext.newPage();
  await viewer.goto(`/v/${token}`);
  await expect(viewer.getByText('Viewing · hosted by Amit')).toBeVisible({ timeout: 15_000 });
  await expect(viewer.getByRole('list', { name: '15 players' }).getByRole('listitem')).toHaveCount(15);

  // ── Top-ups, a typo-guarded short, repays.
  for (const name of ['Kunal', 'Sana']) {
    await card(page, name).getByRole('button', { name: 'Top-up' }).click();
    await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
    await expect(sheet(page)).toBeHidden();
  }
  await card(page, 'Rohit').getByRole('button', { name: 'Short' }).click();
  await sheet(page).getByRole('button', { name: 'Custom' }).click();
  await keypad(page, 3000);
  await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
  await expect(sheet(page).getByText('That is 6 buy-ins. Are you sure?')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Yes, record it' }).click();
  await card(page, 'Priya').getByRole('button', { name: 'Short' }).click();
  await sheet(page).getByRole('button', { name: '₹200', exact: true }).click();
  await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
  await totals(page, 8500, 11700, 3200);
  await expect(card(viewer, 'Rohit')).toHaveAccessibleName('Rohit, in 3500 rupees, short 3000 rupees', { timeout: 5_000 });

  await more(page, 'Rohit', /Repay short/);
  await sheet(page).getByRole('button', { name: 'Custom' }).click();
  await keypad(page, 1000);
  await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
  await more(page, 'Priya', /Repay short/);
  await sheet(page).getByRole('radio', { name: 'Chips' }).click();
  await expect(sheet(page).getByText('Priya hands back ₹200 in chips.')).toBeVisible();
  await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
  await totals(page, 9500, 11500, 2000);

  // ── Leaves: bank pays; player pays bank; part now, rest at the end.
  await more(page, 'Sana', 'Leave table');
  await keypad(page, 1500);
  await sheet(page).getByRole('button', { name: 'Next' }).click();
  await expect(sheet(page).getByText('Bank pays Sana')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Settled ✓' }).click();
  await totals(page, 8000, 10000, 2000);

  await card(page, 'Vikram').getByRole('button', { name: 'Short' }).click();
  await sheet(page).getByRole('button', { name: 'Custom' }).click();
  await keypad(page, 600);
  await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
  await more(page, 'Vikram', 'Leave table');
  await keypad(page, 100);
  await sheet(page).getByRole('button', { name: 'Next' }).click();
  await expect(sheet(page).getByText('Vikram pays bank')).toBeVisible();
  await expect(sheet(page).getByText('₹500', { exact: true })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Settled ✓' }).click();
  await totals(page, 8500, 10500, 2000);

  await more(page, 'Neha', 'Leave table');
  await keypad(page, 2000);
  await sheet(page).getByRole('button', { name: 'Next' }).click();
  await sheet(page).getByRole('button', { name: 'Settle part now', exact: true }).click();
  await keypad(page, 1200);
  await expect(sheet(page).getByText('₹800 will be settled at the end of the night.')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Confirm · ₹1,200' }).click();
  await totals(page, 7300, 8500, 2000);

  // ── Sana rejoins, is undone, rejoins again.
  await page.getByRole('button', { name: /Left the table/ }).click();
  const sanaRow = page.getByRole('listitem').filter({ hasText: 'Sana' }).filter({ has: page.getByRole('button', { name: 'Rejoin' }) });
  await sanaRow.getByRole('button', { name: 'Rejoin' }).click();
  await expect(card(page, 'Sana')).toBeVisible();
  await undo(page, 'Sana joined');
  await expect(card(page, 'Sana')).toHaveCount(0);
  await totals(page, 7300, 8500, 2000);
  await sanaRow.getByRole('button', { name: 'Rejoin' }).click();
  await expect(card(page, 'Sana')).toBeVisible();
  await totals(page, 7800, 9000, 2000);

  // ── Bank check, ₹100 short.
  await page.locator('header').getByRole('button', { name: /^Bank/ }).click();
  await keypad(page, 7700);
  await sheet(page).getByRole('button', { name: 'Record count' }).click();
  await expect(page.getByText('Off by −₹100')).toBeVisible();

  // ── Amit (host + bank) leaves: count → settle → bank cash → new bank holder → no one to host.
  await more(page, 'Amit', 'Leave table');
  await keypad(page, 300);
  await sheet(page).getByRole('button', { name: 'Next' }).click();
  await sheet(page).getByRole('button', { name: 'Settled ✓' }).click();
  await expect(sheet(page).getByText('The bank should have ₹7,500.', { exact: false })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Next' }).click();
  await sheet(page).getByRole('radio', { name: 'Kunal' }).click();
  await sheet(page).getByRole('button', { name: 'Next' }).click();
  await sheet(page).getByRole('button', { name: 'Done' }).click();
  await expect(card(page, 'Amit')).toHaveCount(0);
  await expect(card(page, 'Kunal').getByLabel('Bank')).toBeVisible();
  await totals(page, 7500, 8700, 2000);

  // ── End game, go back once, end again.
  await page.getByRole('button', { name: 'End game' }).click();
  await sheet(page).getByRole('button', { name: 'Start counting' }).click();
  await page.waitForURL(/\/app\/s\/count/);
  await page.getByRole('button', { name: 'Back to game' }).click();
  await sheet(page).getByRole('button', { name: 'Back to game' }).click();
  await page.waitForURL(/\/app\/s\?id=/);
  await page.getByRole('button', { name: 'End game' }).click();
  await sheet(page).getByRole('button', { name: 'Start counting' }).click();
  await page.waitForURL(/\/app\/s\/count/);

  // ── Count 12 players, ₹13 short of the table.
  const counts: [string, number][] = [
    ['Rohit', 3000], ['Priya', 0], ['Kunal', 1500], ['Arjun', 400], ['Pooja', 600], ['Rahul', 700],
    ['Simran', 500], ['Karan', 250], ['Anjali', 450], ['Dev', 500], ['Meera', 300], ['Sana', 487],
  ];
  await page.getByRole('button', { name: /^Rohit/ }).click();
  for (const [, amount] of counts) {
    await keypad(page, amount);
    await sheet(page).getByRole('button', { name: /^Save/ }).click();
  }
  await expect(page.getByText('₹13 missing from the table')).toBeVisible();
  await page.getByRole('button', { name: 'Fix the gap' }).click();
  await sheet(page).getByRole('button', { name: 'Accept and adjust' }).click();
  await sheet(page).getByRole('radio', { name: 'Split equally' }).click();
  await expect(sheet(page).getByText('⚠ +₹2')).toHaveCount(1);
  await expect(sheet(page).getByText('⚠ +₹1')).toHaveCount(11);
  await sheet(page).getByRole('button', { name: 'Apply adjustment' }).click();
  await expect(page.getByText('Everything matches at ₹8,700')).toBeVisible();

  // ── Settle.
  await page.getByRole('button', { name: 'Settle' }).click();
  await page.waitForURL(/\/app\/s\/settle/);
  await page.getByRole('dialog', { name: 'Results' }).click();
  const results = page.locator('main > div > ul').first().locator(':scope > li');
  await expect(results).toHaveCount(15);
  const transfers = page.getByRole('heading', { name: 'Who pays whom' }).locator('..').getByRole('listitem');
  const n = await transfers.count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(14);
  await transfers.first().getByRole('checkbox', { name: 'Paid' }).click();
  await expect(transfers.first().getByRole('checkbox', { name: 'Paid' })).toBeChecked();
  await expect(page.getByText(`1 of ${n} settled`)).toBeVisible();
  await page.getByRole('tab', { name: 'Via bank' }).click();
  await expect(transfers.first()).toContainText('Bank (Kunal)');
  await page.getByRole('tab', { name: 'Fewest payments' }).click();

  await page.getByRole('button', { name: 'Share on WhatsApp' }).click();
  const shared = await page.evaluate(() => (window as unknown as { __shared: string[] }).__shared[0]);
  expect(shared).toContain('Buy-in ₹500 · 15 players');

  await page.getByRole('button', { name: 'Close night' }).click();
  await expect(page.getByRole('button', { name: 'Reopen night' })).toBeVisible();

  // ── Reopen: void one adjustment (allowed even though a payment was ticked), re-fix, re-close.
  await page.getByRole('button', { name: 'Reopen night' }).click();
  await sheet(page).getByLabel('Why are you reopening it?').fill('Recheck adjustments');
  await sheet(page).getByRole('button', { name: 'Reopen night' }).click();
  await page.waitForURL(/\/app\/s\/count/);
  await page.getByRole('button', { name: 'Settle' }).click();
  await page.waitForURL(/\/app\/s\/settle/);
  await page.getByRole('button', { name: 'Log' }).click();
  await page.waitForURL(/\/app\/s\/log/);
  await page.getByRole('tab', { name: 'Fixes' }).click();
  const adjustment = page.getByRole('listitem').filter({ hasText: 'Adjustment for Rohit' });
  await adjustment.getByRole('button', { name: 'Void' }).click();
  await sheet(page).getByRole('button', { name: 'Void' }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(adjustment).toContainText('Voided · Wrong amount');
  await page.goto(`/app/s/count?id=${id}`);
  await expect(page.getByText('₹2 missing from the table')).toBeVisible();
  await page.getByRole('button', { name: 'Fix the gap' }).click();
  await sheet(page).getByRole('button', { name: 'Accept and adjust' }).click();
  await sheet(page).getByRole('radio', { name: 'Bank holder covers it' }).click();
  await sheet(page).getByRole('button', { name: 'Apply adjustment' }).click();
  await expect(page.getByText('Everything matches at ₹8,700')).toBeVisible();
  await page.getByRole('button', { name: 'Settle' }).click();
  await page.getByRole('button', { name: 'Close night' }).click();
  await expect(page.getByRole('button', { name: 'Reopen night' })).toBeVisible();

  // The viewer sees the final settlement.
  await expect(viewer.getByRole('heading', { name: 'Who pays whom' })).toBeVisible({ timeout: 15_000 });

  // Everything reached the server and the night was verified.
  await expect
    .poll(async () => (await admin().from('sessions').select('status, verified_at, review_note').eq('id', id).single()).data, { timeout: 30_000 })
    .toMatchObject({ status: 'closed', verified_at: expect.any(String) });
  const { data: rows } = await admin().from('session_results').select('pnl').eq('session_id', id);
  expect(rows).toHaveLength(15);
  expect(rows!.reduce((a, r) => a + r.pnl, 0)).toBe(0);
  expect(errors).toEqual([]);
  await viewerContext.close();
});
