import type { Metadata } from 'next';
import { Viewer } from './Viewer';

export const metadata: Metadata = { title: 'Live table', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function ViewerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Viewer token={token} />;
}
