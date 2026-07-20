import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * AI Play Zone logo — arcade-style "AiPZ" wordmark.
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
      <Image
        src="/aipz-logo.svg"
        alt="AI Play Zone"
        width={56}
        height={24}
        className="h-6 w-auto"
        priority
      />
      {showText && (
        <span className="font-semibold tracking-tight">AI Play Zone</span>
      )}
    </div>
  );
}
