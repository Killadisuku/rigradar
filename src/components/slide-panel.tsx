import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function SlidePanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close panel"
        tabIndex={open ? 0 : -1}
        className={cn("rr-scrim fixed inset-0 z-40 bg-background/55", open && "is-open")}
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "rr-panel fixed inset-x-0 bottom-0 z-50 flex max-h-[min(82vh,44rem)] flex-col bg-card shadow-dock",
          "rounded-t-3xl md:inset-y-4 md:left-4 md:right-auto md:w-[400px] md:rounded-3xl md:shadow-border",
          open && "is-open",
        )}
      >
        <header className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer ? (
          <div className="border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : (
          <div className="h-[env(safe-area-inset-bottom)]" />
        )}
      </section>
    </>
  );
}
