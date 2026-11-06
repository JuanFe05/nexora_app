import { Link } from "react-router";
import { env } from "@/config/env";
import { cn } from "@/utils";

export default function AuthBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("text-center", compact ? "mb-8 lg:hidden" : "relative z-1 max-w-md px-8 text-white text-shadow-sm")}>
      <Link to="/" className={cn("inline-block font-semibold tracking-wide", compact ? "text-3xl text-gray-800 dark:text-white/90" : "text-5xl xl:text-6xl")}>{env.appName}</Link>
      <p className={cn("mt-4 leading-relaxed", compact ? "text-sm text-gray-600 dark:text-gray-300" : "text-xl text-white")}>Gestión inteligente para una atención conectada</p>
    </div>
  );
}
