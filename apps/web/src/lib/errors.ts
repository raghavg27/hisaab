'use client';
import type { CanApply } from '@hisaab/ledger';
import { formatINR } from '@hisaab/ui';
import { useTranslations } from 'next-intl';

type Refusal = Extract<CanApply, { ok: false }>;

/** A ledger refusal in the user's language, amounts in Indian grouping. Unknown codes keep the ledger's text. */
export function useErrorText() {
  const t = useTranslations('errors');
  return (r: Refusal) => {
    if (!t.has(r.code)) return r.message;
    const params = Object.fromEntries(
      Object.entries(r.params ?? {}).map(([k, v]) => [k, typeof v === 'number' && r.code !== 'table_full' && k !== 'seq' ? formatINR(v) : v]),
    );
    return t(r.code, params);
  };
}
