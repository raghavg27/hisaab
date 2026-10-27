'use client';
import { create } from 'zustand';
import { UNDO_MS } from './config';

export interface Toast {
  id: number;
  message: string;
  /** Event ids the Undo button voids. */
  undo?: { sessionId: string; eventIds: string[] };
  tone?: 'info' | 'error';
  until: number;
}

interface ToastState {
  toast: Toast | null;
  show: (t: Omit<Toast, 'id' | 'until'>, ms?: number) => void;
  clear: () => void;
}

let n = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useToast = create<ToastState>((set) => ({
  toast: null,
  show: (t, ms = UNDO_MS) => {
    if (timer) clearTimeout(timer);
    const toast = { ...t, id: ++n, until: Date.now() + ms };
    set({ toast });
    timer = setTimeout(() => set((s) => (s.toast?.id === toast.id ? { toast: null } : s)), ms);
  },
  clear: () => set({ toast: null }),
}));
