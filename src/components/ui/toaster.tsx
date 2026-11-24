"use client";

import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export interface ToastOptions {
  message: string;
  tone?: "info" | "success" | "error";
  action?: { label: string; onClick: () => void };
  /** ms. Toasts with an action stay at least 10 seconds. Infinity keeps it until dismissed. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastApi {
  show: (toast: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => 0, dismiss: () => undefined });
const MIN_ACTION_MS = 10_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((toast: ToastOptions) => {
    const id = nextId.current++;
    setToasts((all) => [...all.slice(-2), { ...toast, id }]);
    return id;
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* A labelled region so the toasts can be found; each toast is its own status. */}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const duration = toast.action
    ? Math.max(toast.duration ?? MIN_ACTION_MS, MIN_ACTION_MS)
    : (toast.duration ?? 6_000);
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || !Number.isFinite(remaining.current)) return;
    startedAt.current = performance.now();
    timer.current = setTimeout(onDismiss, remaining.current);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      remaining.current -= performance.now() - startedAt.current;
    };
  }, [paused, onDismiss]);

  const pause = () => setPaused(true);
  const resume = (event: { currentTarget: HTMLElement; relatedTarget: EventTarget | null }) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
      return;
    setPaused(false);
  };

  return (
    // Hover and focus pause the timer (WCAG 2.2.1), so actions such as Undo stay reachable.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className={cn(
        "ov-border pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border-2 bg-surface p-3 pl-4 text-text shadow-lg",
        toast.tone === "error"
          ? "border-danger"
          : toast.tone === "success"
            ? "border-success"
            : "border-primary",
      )}
    >
      <p className="min-w-0 flex-1 font-semibold">{toast.message}</p>
      {toast.action ? (
        <Button
          variant="secondary"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
        >
          {toast.action.label}
        </Button>
      ) : null}
      <Button variant="ghost" size="icon" onClick={onDismiss} aria-label="Dismiss notification">
        <X aria-hidden />
      </Button>
    </div>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
