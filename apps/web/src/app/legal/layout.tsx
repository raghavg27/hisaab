import Link from 'next/link';
import { DiyaMark } from '@/components/DiyaMark';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-[640px] px-5 py-8">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 text-text-2">
        <DiyaMark size={24} /> Hisaab
      </Link>
      <article className="space-y-4 text-text-2 [&_h1]:font-serif [&_h1]:text-[32px] [&_h1]:text-text [&_h2]:pt-4 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h2]:text-text [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </article>
      <nav className="mt-10 flex gap-4 text-caption text-text-3">
        <Link href="/legal/terms" className="underline">
          Terms
        </Link>
        <Link href="/legal/privacy" className="underline">
          Privacy
        </Link>
      </nav>
    </main>
  );
}
