import { useState } from "react";
import { env } from "@/config/env";
import { getCurrentYear } from "./current-year";

export default function LoginFooter() {
  const [year] = useState(getCurrentYear);
  return (
    <footer className="mx-auto w-full max-w-md px-2 pb-24 text-center text-xs leading-relaxed wrap-break-word text-gray-500 sm:px-6 lg:pb-6 dark:text-gray-400">
      {env.appName} © {year}. Todos los derechos reservados. El uso de este sistema de software está sujeto a los términos de licencia
    </footer>
  );
}
