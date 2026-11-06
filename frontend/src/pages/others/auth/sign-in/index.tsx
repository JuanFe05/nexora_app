import { PageMeta } from "@/components/shared/page-meta";
import { env } from "@/config/env";
import SignInFormFields from "./form";
import SignInHeader from "./header";

export default function SignInPage() {
  return (
    <div className="flex w-full flex-1 flex-col lg:w-1/2">
      <PageMeta title={`Iniciar sesión | ${env.appName}`} description="Iniciar sesión" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div><SignInHeader /><SignInFormFields /></div>
      </div>
    </div>
  );
}
