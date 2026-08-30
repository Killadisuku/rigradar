import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("text-primary", className)}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
      <circle cx="16" cy="16" r="8.5" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
      <path
        d="M16 6.5 L20.4 21.2 L16 18.4 L11.6 21.2 Z"
        fill="currentColor"
      />
    </svg>
  );
}
