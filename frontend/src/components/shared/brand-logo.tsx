import { cn } from "@/utils";

/** Isotipo oficial servido tal cual desde `public/images/logo`; decorativo, la marca la nombra el texto o el enlace. */
export function BrandLogo({ className }: { className?: string }) {
  return <img src="/images/logo/Nexora_Logo.svg" alt="" aria-hidden="true" decoding="async" className={cn("shrink-0 select-none", className)} />;
}
