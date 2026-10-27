import { expect, test } from '@playwright/test';
import { admin, deleteUser, makeUser, sheet, signIn } from './helpers';
import { card, keypad, startNight } from './night';

test.describe('viewer (§14.3 #3)', () => {
  let userId = '';
  test.afterAll(async () => userId && deleteUser(userId));

  test('an anonymous viewer sees each event within 2 s', async ({ page, context, browser }) => {
    const u = await makeUser('Amit');
    userId = u.userId;
    await signIn(context, u.session);
    const id = await startNight(page, 'Viewer Gang', ['Rohit', 'Priya']);

    // The link works once the night has synced.
    let token = '';
    await expect
      .poll(async () => (token = (await admin().from('sessions').select('view_token').eq('id', id).maybeSingle()).data?.view_token ?? ''), {
        timeout: 20_000,
      })
      .not.toBe('');

    const viewerContext = await browser.newContext({ ...test.info().project.use });
    await viewerContext.addInitScript(() => localStorage.setItem('hisaab-splash-day', new Date().toDateString()));
    const viewer = await viewerContext.newPage();
    await viewer.goto(`/v/${token}`);
    await expect(viewer.getByText('Viewing · hosted by Amit')).toBeVisible({ timeout: 15_000 });
    await expect(card(viewer, 'Rohit')).toHaveAccessibleName('Rohit, in 500 rupees');
    await expect(card(viewer, 'Rohit').getByRole('button', { name: 'Top-up' })).toHaveCount(0);

    // Top-up on the host's phone shows up on the viewer's within 2 s.
    await card(page, 'Rohit').getByRole('button', { name: 'Top-up' }).click();
    await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
    await expect(card(viewer, 'Rohit')).toHaveAccessibleName('Rohit, in 1000 rupees', { timeout: 2_000 });

    await card(page, 'Priya').getByRole('button', { name: 'Short' }).click();
    await sheet(page).getByRole('button', { name: 'Custom' }).click();
    await keypad(page, 300);
    await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
    await expect(card(viewer, 'Priya')).toHaveAccessibleName('Priya, in 800 rupees, short 300 rupees', { timeout: 2_000 });

    // The viewer can read the full log.
    await viewer.getByRole('button', { name: 'Log' }).click();
    await expect(viewer).toHaveURL(new RegExp(`/v/${token}/log`));
    await expect(viewer.getByText(/Priya.*short.*₹300/i).first()).toBeVisible();

    // Revoking the link locks the viewer out.
    await admin().from('sessions').update({ view_token_revoked_at: new Date().toISOString() }).eq('id', id);
    const late = await (await browser.newContext({ ...test.info().project.use })).newPage();
    await late.goto(`/v/${token}`);
    await expect(late.getByText('This link has expired or was turned off.')).toBeVisible({ timeout: 15_000 });
    await viewerContext.close();
  });
});
