import { Suspense } from 'react';
import { Log } from './Log';

export default function LogPage() {
  return (
    <Suspense>
      <Log />
    </Suspense>
  );
}
