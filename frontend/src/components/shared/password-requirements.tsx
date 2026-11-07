import { CheckIcon, XIcon } from "@/icons";
import { PASSWORD_RULES, type PasswordPolicyEvaluation } from "@/lib/password-policy";

/** Presentation only: this component must never receive the password. */
export function PasswordRequirements({ evaluation, showErrors = false, sentenceLabels = false }: {
  evaluation: PasswordPolicyEvaluation;
  showErrors?: boolean;
  /** Standalone sentences for user creation; defaults preserve profile descriptions. */
  sentenceLabels?: boolean;
}) {
  const metCount = PASSWORD_RULES.filter(rule => evaluation[rule.id]).length;
  return <>
    <ul aria-label="Requisitos de contraseña" className="space-y-2 text-sm">
      {PASSWORD_RULES.map(rule => {
        const met = evaluation[rule.id];
        const failed = !met && showErrors;
        return <li key={rule.id} className={`flex items-start gap-2 ${met ? "text-green-600 dark:text-green-400" : failed ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
          {met ? <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : failed ? <XIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <span aria-hidden="true" className="mt-1 size-3 shrink-0 rounded-full border border-current" />}
          <span>{sentenceLabels ? `${rule.label.replace("…", "")}.` : rule.label} <span className="sr-only">{met ? "cumplido" : failed ? "incumplido" : "pendiente"}</span></span>
        </li>;
      })}
    </ul>
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{metCount} de {PASSWORD_RULES.length} requisitos cumplidos.</p>
  </>;
}
