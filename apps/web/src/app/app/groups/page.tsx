import { Suspense } from 'react';
import { Groups } from './Groups';

export default function GroupsPage() {
  return (
    <Suspense>
      <Groups />
    </Suspense>
  );
}
