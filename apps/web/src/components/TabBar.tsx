'use client';
import { History, Home, User, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@hisaab/ui';

const TABS = [
  { href: '/app', key: 'home', Icon: Home },
  { href: '/app/groups', key: 'groups', Icon: Users },
  { href: '/app/history', key: 'history', Icon: History },
  { href: '/app/me', key: 'me', Icon: User },
] as const;

export function TabBar() {
  const t = useTranslations('tabs');
  const path = usePathname();
  return (
    <nav
      aria-label={t('nav')}
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[480px] border-t border-hairline bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      {TABS.map(({ href, key, Icon }) => {
        const active = href === '/app' ? path === '/app' : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]',
              active ? 'text-flame' : 'text-text-3',
            )}
          >
            <Icon size={20} strokeWidth={1.5} aria-hidden />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
