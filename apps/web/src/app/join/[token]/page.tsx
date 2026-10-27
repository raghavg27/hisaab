import type { Metadata } from 'next';
import { AppGate } from '../../app/AppGate';
import { Join } from './Join';

export const metadata: Metadata = { title: 'Join group', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AppGate>
      <Join token={token} />
    </AppGate>
  );
}
