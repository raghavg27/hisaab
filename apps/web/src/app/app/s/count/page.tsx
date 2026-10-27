import { Suspense } from 'react';
import { Count } from './Count';

export default function CountPage() {
  return (
    <Suspense>
      <Count />
    </Suspense>
  );
}
