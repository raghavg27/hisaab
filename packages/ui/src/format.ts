const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const grouped = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹1,00,000. Negative values use a real minus sign: −₹700. */
export function formatINR(n: number): string {
  return n < 0 ? `−${inr.format(-n)}` : inr.format(n);
}

/** +₹500 / −₹700 / ₹0 */
export function formatSigned(n: number): string {
  return n > 0 ? `+${inr.format(n)}` : formatINR(n);
}

/** 1,00,000 (no symbol) */
export function formatGrouped(n: number): string {
  return grouped.format(n);
}

/** Screen-reader text: "800 rupees", "minus 700 rupees". */
export function rupeesLabel(n: number): string {
  return `${n < 0 ? 'minus ' : ''}${Math.abs(n)} rupees`;
}
