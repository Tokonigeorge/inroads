"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; message: string; action?: { label: string; onClick: () => void } };
type ToastApi = { show: (message: string, action?: Toast["action"]) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Bottom-centre on mobile (above the nav), bottom-left on desktop. 6s, or 10s with Undo. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const show = useCallback<ToastApi["show"]>(
    (message, action) => {
      const id = ++seq.current;
      setToasts((ts) => [...ts.slice(-2), { id, message, action }]);
      setTimeout(() => dismiss(id), action ? 10_000 : 6_000);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-[80] flex flex-col items-center gap-2 md:bottom-7"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-center gap-4 rounded-[12px] bg-ink px-4 py-3 text-[14px] font-[550] text-bg shadow-pop">
            <span>{t.message}</span>
            {t.action ? (
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
