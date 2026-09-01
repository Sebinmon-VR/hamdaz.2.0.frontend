"use client";

import clsx from "clsx";
import { AlertTriangle, Inbox, Loader2, Lock, PlugZap, X } from "lucide-react";
import { useEffect, type ElementType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/controls";
import { Panel } from "@/components/ui/primitives";

/* ── loading ─────────────────────────────────────────────────────────── */

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton rounded-full", className)} />;
}

/** Placeholder shaped like the content that replaces it, not a spinner. */
export function PanelSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <Panel className={clsx("p-5", className)}>
      <Skeleton className="h-3.5 w-1/3" />
      <div className="mt-5 space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          // The last line is short, the way a real paragraph ends.
          <Skeleton key={i} className={clsx("h-3", i === lines - 1 && "w-2/3")} />
        ))}
      </div>
    </Panel>
  );
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 rounded-[18px]" />
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("size-4 animate-spin text-ink-3", className)} />;
}

/* ── nothing / something went wrong ──────────────────────────────────── */

export function Empty({
  icon: Icon = Inbox,
  title,
  body,
  action,
  className,
}: {
  icon?: ElementType;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center rounded-[20px] border border-dashed border-line px-6 py-14 text-center",
        className,
      )}
    >
      <span className="mb-4 grid size-11 place-items-center rounded-full bg-panel-2 text-ink-3">
        <Icon className="size-4.5" strokeWidth={1.9} />
      </span>
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-ink-3">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * One place that turns a thrown ApiError into something a person can act on.
 * The three cases worth telling apart are "you are not allowed", "it is not
 * there", and "the API did not answer" — everything else is the message the
 * backend sent, which is written for humans throughout.
 */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const api = error instanceof ApiError ? error : null;

  if (api?.forbidden) {
    return (
      <Empty
        icon={Lock}
        title="You do not have access to this"
        body="Reaching this screen depends on a module your teams have not been granted. An administrator can change that under Team access."
        className={className}
      />
    );
  }
  if (api?.status === 0) {
    return (
      <Empty
        icon={PlugZap}
        title="Could not reach the API"
        body="The Hamdaz backend did not answer. If you are running it locally, check that it is up and that this origin is listed in its CORS_ORIGINS."
        action={onRetry && <Button onClick={onRetry}>Try again</Button>}
        className={className}
      />
    );
  }
  return (
    <Empty
      icon={AlertTriangle}
      title={api?.missing ? "Not found" : "Something went wrong"}
      body={api?.message ?? (error instanceof Error ? error.message : "An unexpected error occurred.")}
      action={onRetry && <Button onClick={onRetry}>Try again</Button>}
      className={className}
    />
  );
}

/** A compact inline version, for a failed part of an otherwise fine screen. */
export function InlineNotice({
  tone = "warn",
  children,
  className,
}: {
  tone?: "warn" | "danger" | "info" | "positive";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
    positive: "bg-positive-soft text-positive",
  };
  return (
    <div
      className={clsx(
        "flex items-start gap-2.5 rounded-[18px] px-4 py-3 text-[12.5px] leading-relaxed",
        tones[tone],
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.1} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ── modal ───────────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Stops the page behind scrolling under the dialog on touch devices.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          "rise relative w-full overflow-hidden rounded-t-[24px] border border-line bg-float shadow-[var(--shadow-float)] sm:rounded-[24px]",
          widths[width],
        )}
      >
        <div className="flex items-start gap-4 px-6 pb-4 pt-6">
          <div className="min-w-0 flex-1">
            <h2 className="hero-title text-[22px] text-ink">{title}</h2>
            {description && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-panel-2 text-ink-3 transition hover:bg-panel-3 hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        </div>
        {children && <div className="max-h-[65vh] overflow-y-auto px-6 pb-2">{children}</div>}
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line bg-panel-2 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
