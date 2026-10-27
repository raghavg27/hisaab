'use client';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Loading } from '@/components/Splash';
import { TabBar } from '@/components/TabBar';
import { useAuth } from '@/lib/auth';
import { useGo } from '@/lib/nav';

// Once-a-day splash where the installed app opens (start_url), not on the public landing page,
// and never on deep links such as the Live Table, which must stay free of the 3D chunk.
const Splash = dynamic(() => import('@/components/three/SplashGate').then((m) => m.SplashGate), { ssr: false });

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

  const tabs = !NO_TABS.some((p) => path.startsWith(p));
  // The splash keeps one position in the tree so it isn't remounted (and cut short) once auth is ready.
  return (
    <>
      {path === '/app' && <Splash />}
      {!ready || needsLogin || needsOnboarding ? (
        <Loading />
      ) : (
        <div className="mx-auto min-h-dvh max-w-[480px]">
          <div className={tabs ? 'pb-24' : ''}>{children}</div>
          {tabs && <TabBar />}
        </div>
      )}
    </>
  );
}
