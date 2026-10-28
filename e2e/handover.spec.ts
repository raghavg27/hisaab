import { expect, test, type Browser, type Page } from '@playwright/test';
import { admin, deleteUser, makeUser, sheet, signIn } from './helpers';
import { card, startNight } from './night';

const users: string[] = [];
test.afterAll(async () => Promise.all(users.map(deleteUser)));

/** Amit hosts a night with Rohit and Priya; Rohit then gets an account linked to his member row. */
async function twoPhones(page: Page, browser: Browser, role: 'member' | 'admin') {
  const amit = await makeUser('Amit');
  const rohit = await makeUser('Rohit');
  users.push(amit.userId, rohit.userId);
  await signIn(page.context(), amit.session);
  const id = await startNight(page, 'Handover Gang', ['Rohit', 'Priya']);

  let groupId = '';
  await expect
    .poll(async () => (groupId = (await admin().from('sessions').select('group_id').eq('id', id).maybeSingle()).data?.group_id ?? ''), { timeout: 20_000 })
    .not.toBe('');
  const { error } = await admin().from('group_members').update({ user_id: rohit.userId, role }).eq('group_id', groupId).eq('nickname', 'Rohit');
  if (error) throw error;
  await page.reload(); // pulls the claimed member onto Amit's phone

  const rohitContext = await browser.newContext({ ...test.info().project.use });
  await signIn(rohitContext, rohit.session);
  const rohitPage = await rohitContext.newPage();
  return { id, rohitPage };
}

test('host handover between two phones; the old host becomes a viewer (§14.3 #4)', async ({ page, browser }) => {
  const { id, rohitPage } = await twoPhones(page, browser, 'member');
  await rohitPage.goto(`/app/s?id=${id}`);
  await expect(rohitPage.getByText('Only the host can record.', { exact: false })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'End game' }).click();
  await sheet(page).getByRole('button', { name: 'Hand over hosting' }).click();
  await sheet(page).getByRole('radio', { name: 'Rohit' }).click();
  await sheet(page).getByRole('button', { name: 'Make host' }).click();

  await expect(page.getByText('Only the host can record.', { exact: false })).toBeVisible();
  await expect(card(page, 'Priya').getByRole('button', { name: 'Top-up' })).toHaveCount(0);

  // Rohit records on his phone from now on.
  await expect(card(rohitPage, 'Priya').getByRole('button', { name: 'Top-up' })).toBeVisible({ timeout: 15_000 });
  await card(rohitPage, 'Priya').getByRole('button', { name: 'Top-up' }).click();
  await sheet(rohitPage).getByRole('button', { name: /^Confirm/ }).click();
  await expect(card(page, 'Priya')).toHaveAccessibleName('Priya, in 1000 rupees', { timeout: 5_000 });
  await rohitPage.context().close();
});

test('force takeover from an offline host; its unsynced entries are rejected and shown (§14.3 #5)', async ({ page, browser }) => {
  const { id, rohitPage } = await twoPhones(page, browser, 'admin');
  await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible({ timeout: 15_000 });

  // Amit's phone drops off and keeps recording.
  await page.context().setOffline(true);
  await card(page, 'Priya').getByRole('button', { name: 'Top-up' }).click();
  await sheet(page).getByRole('button', { name: /^Confirm/ }).click();
  await expect(card(page, 'Priya')).toHaveAccessibleName('Priya, in 1000 rupees');

  // Eleven minutes of silence later, Rohit (an admin) takes over.
  await admin()
    .from('sessions')
    .update({ host_last_seen_at: new Date(Date.now() - 11 * 60_000).toISOString() })
    .eq('id', id);
  await rohitPage.goto(`/app/s?id=${id}`);
  await rohitPage.getByRole('button', { name: 'Take over hosting' }).click();
  await expect(card(rohitPage, 'Priya').getByRole('button', { name: 'Top-up' })).toBeVisible({ timeout: 15_000 });
  await expect(card(rohitPage, 'Priya')).toHaveAccessibleName('Priya, in 500 rupees');

  // Back online, Amit's stale entry is refused and surfaced.
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('You are not the host anymore, so this entry was not saved:')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('listitem').filter({ hasText: 'Priya topped up · ₹500' })).toBeVisible();
  await expect(card(page, 'Priya')).toHaveAccessibleName('Priya, in 500 rupees');
  await rohitPage.context().close();
});
