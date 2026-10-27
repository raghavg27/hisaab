import { Suspense } from 'react';
import { Wizard } from './Wizard';

export default function NewNightPage() {
  return (
    <Suspense>
      <Wizard />
    </Suspense>
  );
}
