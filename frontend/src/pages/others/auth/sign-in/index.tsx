import { PageMeta } from "@/components/shared/page-meta";
import { env } from "@/config/env";
import { ChevronLeftIcon } from "@/icons";
import { Link } from "react-router";
import SignInFormFields from "./form";
import SignInHeader from "./header";

export default function SignInPage() {
  return (
    <div className="flex w-full flex-1 flex-col lg:w-1/2">
      <PageMeta title={`Iniciar sesión | ${env.appName}`} description="Iniciar sesión" />
      <div className="mx-auto mb-5 w-full max-w-md sm:pt-10">
        <Link to="/" className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
          <ChevronLeftIcon /> Volver a la página de inicio
        </Link>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div><SignInHeader /><SignInFormFields /></div>
      </div>
    </div>
  );
}
