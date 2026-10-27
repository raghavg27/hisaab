import { Suspense } from 'react';
import { Group } from './Group';

export default function GroupPage() {
  return (
    <Suspense>
      <Group />
    </Suspense>
  );
}
