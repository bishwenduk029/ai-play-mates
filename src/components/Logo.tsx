import { cn } from "@/lib/utils";

/**
 * AI Play Zone logo — emerald accent tile with bold "APZ" + wordmark.
 * The wordmark inherits text color so it adapts to light/dark headers.
 * Usage: <Logo className="h-8" /> or <Logo showText />
 */
export function Logo({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex size-6 items-center justify-center rounded-md bg-emerald-500 text-black">
        <span className="text-xs font-bold tracking-tight">APZ</span>
      </div>
      {showText && (
        <span className="font-semibold tracking-tight">AI Play Zone</span>
      )}
    </div>
  );
}