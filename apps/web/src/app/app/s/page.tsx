import { Suspense } from 'react';
import { LiveTable } from './LiveTable';

export default function LiveTablePage() {
  return (
    <Suspense>
      <LiveTable />
    </Suspense>
  );
}
