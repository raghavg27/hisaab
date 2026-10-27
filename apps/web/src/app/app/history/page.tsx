import { Suspense } from 'react';
import { History } from './History';

export default function HistoryPage() {
  return (
    <Suspense>
      <History />
    </Suspense>
  );
}
