import { Suspense } from 'react';
import { Me } from './Me';

export default function MePage() {
  return (
    <Suspense>
      <Me />
    </Suspense>
  );
}
