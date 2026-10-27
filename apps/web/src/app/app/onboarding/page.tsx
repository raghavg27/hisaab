import { Suspense } from 'react';
import { Onboarding } from './Onboarding';

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}
