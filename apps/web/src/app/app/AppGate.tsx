'use client';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Loading } from '@/components/Splash';
import { TabBar } from '@/components/TabBar';
import { useAuth } from '@/lib/auth';
import { useGo } from '@/lib/nav';

const NO_TABS = ['/app/s', '/app/new', '/app/onboarding', '/join'];

/** Auth gate for /app: signed in (not anonymous) with a profile and the 18+ confirmation. */
export function AppGate({ children }: { children: ReactNode }) {
  const { ready, userId, isAnonymous, profile } = useAuth();
  const path = usePathname();
  const go = useGo();
  const onboarding = path.startsWith('/app/onboarding');
  const needsLogin = ready && (!userId || isAnonymous);
  const needsOnboarding = ready && !needsLogin && (!profile || !profile.ageConfirmedAt) && !onboarding;

  useEffect(() => {
    if (needsLogin) go(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
    else if (needsOnboarding) go(`/app/onboarding?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
  }, [needsLogin, needsOnboarding, go]);

  if (!ready || needsLogin || needsOnboarding) return <Loading />;
  const tabs = !NO_TABS.some((p) => path.startsWith(p));
  return (
    <div className="mx-auto min-h-dvh max-w-[480px]">
      <div className={tabs ? 'pb-24' : ''}>{children}</div>
      {tabs && <TabBar />}
    </div>
  );
}
