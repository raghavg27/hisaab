'use client';
import { isSettleable } from '@hisaab/ledger';
import { useEffect } from 'react';
import { Loading } from '@/components/Splash';
import { SettlementView } from '@/components/night/SettlementView';
import { useNightLoader } from '@/components/night/useNightLoader';
import { useGo, useQueryId } from '@/lib/nav';

export function Settle() {
  const id = useQueryId();
  const { night, missing } = useNightLoader(id);
  const go = useGo();
  const ready = !!night && (night.state.status === 'closed' || isSettleable(night.state));
  useEffect(() => {
    if (!night || ready) return;
    if (night.state.status === 'live') go(`/app/s?id=${night.session.id}`, { replace: true });
    else if (night.state.status === 'counting') go(`/app/s/count?id=${night.session.id}`, { replace: true });
  }, [night, ready, go]);
  if (missing) return null;
  if (!night || !ready) return <Loading />;
  return <SettlementView night={night} />;
}
