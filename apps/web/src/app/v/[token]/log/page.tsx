import type { Metadata } from 'next';
import { ViewerLog } from './ViewerLog';

export const metadata: Metadata = { title: 'Log', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function ViewerLogPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ViewerLog token={token} />;
}
