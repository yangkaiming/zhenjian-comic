import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  type: 'info' | 'success' | 'error';
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, type?: Toast['type']) => void;
  remove: (id: number) => void;
}

let seed = 0;

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push(text, type = 'info') {
    seed += 1;
    const id = seed;
    set((s) => ({ toasts: [...s.toasts, { id, text, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 2400);
  },
  remove(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = {
  info: (t: string) => useToast.getState().push(t, 'info'),
  success: (t: string) => useToast.getState().push(t, 'success'),
  error: (t: string) => useToast.getState().push(t, 'error'),
};
