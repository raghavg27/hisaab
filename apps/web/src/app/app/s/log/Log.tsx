'use client';
import { useSearchParams } from 'next/navigation';
import { Loading } from '@/components/Splash';
import { LogView } from '@/components/night/LogView';
import { useNightLoader } from '@/components/night/useNightLoader';
import { useQueryId } from '@/lib/nav';

export function Log() {
  const id = useQueryId();
  const params = useSearchParams();
  const { night } = useNightLoader(id);
  if (!night) return <Loading />;
  return <LogView night={night} member={params.get('member')} initialFilter={params.get('filter') === 'gap' ? 'gap' : 'all'} />;
}
