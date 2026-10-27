'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { recordOne, record } from '@/lib/night';
import { useToast } from '@/lib/toast';
import { cn } from '@hisaab/ui';

/** Toast with Undo for 6 s after every action (§8.4). */
export function ToastHost({ bottom = 96 }: { bottom?: number }) {
  const t = useTranslations('common');
  const tl = useTranslations('live.toast');
  const { toast, clear, show } = useToast();

  async function undo() {
    if (!toast?.undo) return;
    const { sessionId, eventIds } = toast.undo;
    clear();
    const r =
      eventIds.length === 1
        ? await recordOne(sessionId, 'EVENT_VOIDED', { targetId: eventIds[0]!, reason: 'undo' })
        : await record(
            sessionId,
            // Void in reverse so later entries go first (e.g. BUY_IN before its PLAYER_JOINED).
            [...eventIds].reverse().map((targetId) => ({ type: 'EVENT_VOIDED' as const, payload: { targetId, reason: 'undo' as const } })),
          );
    show(r.ok ? { message: tl('undone') } : { message: r.message, tone: 'error' }, 2500);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 z-40 mx-auto max-w-[480px] px-4" style={{ bottom }} aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className={cn(
              'pointer-events-auto flex min-h-12 items-center gap-3 rounded-[var(--radius-btn)] border bg-surface-2 py-2 pr-2 pl-4 shadow-[var(--key)]',
              toast.tone === 'error' ? 'border-loss/40 text-loss' : 'border-hairline-strong',
            )}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <span className="flex-1 text-label">{toast.message}</span>
            {toast.undo && (
              <button type="button" onClick={undo} className="min-h-10 rounded-[10px] px-3 text-label font-semibold text-flame active:bg-surface-1">
                {t('undo')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
