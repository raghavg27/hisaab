import { expect, test, type Page } from '@playwright/test';
import { deleteUser, makeUser, sheet, signIn } from './helpers';
import { card, countAll, keypad, startNight } from './night';

const users: string[] = [];
test.afterAll(async () => Promise.all(users.map(deleteUser)));

async function host(page: Page, context: import('@playwright/test').BrowserContext, opts?: { splash?: boolean }) {
  const u = await makeUser('Amit');
  users.push(u.userId);
  await signIn(context, u.session, opts);
}

test('gap: miscount, missing message, split equally, settlement shows ⚠ (§14.3 #6)', async ({ page, context }) => {
  await host(page, context);
  await startNight(page, 'Gap Gang', ['Rohit', 'Priya']);
  await countAll(page, { Amit: 500, Rohit: 500, Priya: 400 });
  await expect(page.getByText('₹100 missing from the table').first()).toBeVisible();
  // Settling is blocked until the gap is 0 or adjusted.
  await expect(page.getByRole('button', { name: 'Settle' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Fix the gap' }).click();
  await sheet(page).getByRole('button', { name: 'Accept and adjust' }).click();
  await sheet(page).getByRole('radio', { name: 'Split equally' }).click();
  await sheet(page).getByRole('button', { name: 'Apply adjustment' }).click();
  await expect(page.getByText('Everything matches — ₹1,500')).toBeVisible();

  await page.getByRole('button', { name: 'Settle' }).click();
  await page.getByRole('dialog', { name: 'Results' }).click();
  await expect(page.getByRole('button', { name: /adjusted/ })).toHaveCount(3);
});

test('leave with partial settlement defers the rest to the end (§14.3 #7)', async ({ page, context }) => {
  await host(page, context);
  await startNight(page, 'Leave Gang', ['Rohit', 'Priya']);

  await card(page, 'Rohit').getByRole('button', { name: /More/ }).click();
  await sheet(page).getByRole('button', { name: 'Leave table' }).click();
  await keypad(page, 900);
  await sheet(page).getByRole('button', { name: 'Next' }).click();
  await expect(sheet(page).getByText('Bank pays Rohit')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Settle part now', exact: true }).click();
  await keypad(page, 500);
  await expect(sheet(page).getByText('₹400 moves to end-of-night settlement.')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Confirm · ₹500' }).click();
  await expect(card(page, 'Rohit')).toHaveCount(0);

  await countAll(page, { Amit: 300, Priya: 300 });
  await expect(page.getByText('Everything matches — ₹600')).toBeVisible();
  await page.getByRole('button', { name: 'Settle' }).click();
  await page.getByRole('dialog', { name: 'Results' }).click();
  await page.getByRole('button', { name: /Rohit/ }).first().click();
  await expect(page.getByText('+₹400 deferred')).toBeVisible();
  const transfers = page.getByRole('heading', { name: 'Who pays whom' }).locator('..').getByRole('listitem');
  // Amit holds the bank's ₹1,000: his own ₹300, Priya's ₹300 and Rohit's deferred ₹400.
  await expect(transfers).toHaveText([/Amit → Rohit\s*₹400/, /Amit → Priya\s*₹300/]);
});

test('undo within 6 s, fix via the log after (§14.3 #8)', async ({ page, context }) => {
  await host(page, context);
  await startNight(page, 'Undo Gang', ['Rohit']);

  await card(page, 'Rohit').getByRole('button', { name: 'Top-up' }).click();
  await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
  await expect(card(page, 'Rohit')).toHaveAccessibleName('Rohit, in 1000 rupees');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(card(page, 'Rohit')).toHaveAccessibleName('Rohit, in 500 rupees');

  await card(page, 'Rohit').getByRole('button', { name: 'Top-up' }).click();
  await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden({ timeout: 8_000 });

  await page.getByRole('button', { name: 'Log', exact: true }).first().click();
  await page.waitForURL(/\/app\/s\/log/);
  const entry = page.getByRole('listitem').filter({ hasText: 'Rohit topped up · ₹500' }).filter({ hasNotText: 'Voided' });
  await entry.getByRole('button', { name: 'Fix' }).click();
  await keypad(page, 300);
  await sheet(page).getByRole('button', { name: 'Fix · ₹300' }).click();
  await expect(page.getByText('Rohit topped up · ₹300')).toBeVisible();
  await expect(page.getByText(/Voided · Wrong amount/)).toBeVisible();
  // The earlier undo is in the log too, struck through with its reason.
  await expect(page.getByText(/Voided · Undo/)).toBeVisible();

  await page.goBack();
  await expect(card(page, 'Rohit')).toHaveAccessibleName('Rohit, in 800 rupees');
});

test.describe('reduced motion (§14.3 #9)', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('no WebGL canvas on the splash or the reveal', async ({ page, context }) => {
    // The once-a-day splash plays where the app opens.
    await host(page, context, { splash: true });
    await page.goto('/app');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('hisaab-splash-day'))).toBe(await page.evaluate(() => new Date().toDateString()));
    await page.waitForTimeout(1_500);
    await expect(page.locator('canvas')).toHaveCount(0);

    await startNight(page, 'Calm Gang', ['Rohit']);
    await countAll(page, { Amit: 500, Rohit: 500 });
    await page.getByRole('button', { name: 'Settle' }).click();
    await expect(page.getByRole('dialog', { name: 'Results' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});

test('the once-a-day 3D splash plays where the app opens, not on the landing page', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForTimeout(1_000);
  await expect(page.locator('canvas')).toHaveCount(0);
  await host(page, context, { splash: true });
  await page.goto('/app');
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('switching to Hinglish in Me changes the UI and survives a reload', async ({ page, context }) => {
  await host(page, context);
  await page.goto('/app/me');
  await page.getByRole('radio', { name: 'Hinglish' }).click();
  await expect(page.getByRole('heading', { name: 'Main', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('button', { name: 'Naya game' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Naya game' })).toBeVisible();
});

test('with sounds on, confirming an action plays without errors', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await host(page, context);
  await page.goto('/app/me');
  await page.getByRole('switch', { name: 'Sounds' }).check({ force: true });
  await startNight(page, 'Loud Gang', ['Rohit']);
  await card(page, 'Rohit').getByRole('button', { name: 'Top-up' }).click();
  await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
  await expect(card(page, 'Rohit')).toHaveAccessibleName('Rohit, in 1000 rupees');
  expect(errors).toEqual([]);
});
