import { useState } from "react";
import { env } from "@/config/env";
import { getCurrentYear } from "./current-year";

export function CopyrightText() {
  const [year] = useState(getCurrentYear);
  return (
    <>
      <span className="block">{env.appName} © {year}. Todos los derechos reservados.</span>{" "}
      <span className="block">El uso de este sistema de software está sujeto a los términos de licencia.</span>
    </>
  );
}

// Mobile/tablet only: from `lg` the copyright lives in the photo panel, beside the theme toggle.
export default function LoginFooter() {
  return (
    <footer className="mx-auto w-full max-w-md px-2 pb-24 text-center text-xs leading-relaxed wrap-break-word text-gray-500 sm:px-6 lg:hidden dark:text-gray-400">
      <CopyrightText />
    </footer>
  );
}
