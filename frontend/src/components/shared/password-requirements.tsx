import { CheckIcon, XIcon } from "@/icons";
import { PASSWORD_RULES, type PasswordPolicyEvaluation } from "@/lib/password-policy";

/** Presentation only: this component must never receive the password. */
export function PasswordRequirements({ evaluation }: { evaluation: PasswordPolicyEvaluation }) {
  const metCount = PASSWORD_RULES.filter(rule => evaluation[rule.id]).length;
  return <>
    <ul aria-label="Requisitos de contraseña" className="space-y-1 text-sm">
      {PASSWORD_RULES.map(rule => {
        const met = evaluation[rule.id];
        const Icon = met ? CheckIcon : XIcon;
        return <li key={rule.id} className={`flex items-start gap-2 ${met ? "text-success-600 dark:text-success-400" : "text-gray-500 dark:text-gray-400"}`}>
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span>{rule.label} <span className="sr-only">{met ? "cumplido" : "pendiente"}</span></span>
        </li>;
      })}
    </ul>
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{metCount} de {PASSWORD_RULES.length} requisitos cumplidos.</p>
  </>;
}
