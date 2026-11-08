import { Card } from "@/components/ui/card";
import { LockIcon } from "@/icons";
import { PasswordForm } from "./password-form";

export function SecuritySection() {
  return <section aria-labelledby="security-title">
    <Card className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="security-title" className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
          <LockIcon aria-hidden="true" className="size-6" />Seguridad
        </h2>
      </div>
      <PasswordForm />
    </Card>
  </section>;
}
