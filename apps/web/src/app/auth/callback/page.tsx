import { Suspense } from 'react';
import { Callback } from './Callback';

export default function CallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
