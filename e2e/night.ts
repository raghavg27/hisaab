import { expect, type Page } from '@playwright/test';
import { sheet } from './helpers';

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
