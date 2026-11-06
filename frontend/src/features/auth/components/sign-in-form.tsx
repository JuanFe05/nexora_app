import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { authErrorMessage } from "../error-message";
import { useAuth } from "../use-auth";

export default function SignInForm() {
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const identifier = data.get("identificador");
    const passwordValue = data.get("contrasena");
    setPending(true);
    setError(null);
    try {
      await login({
        identificador: typeof identifier === "string" ? identifier : "",
        contrasena: typeof passwordValue === "string" ? passwordValue : "",
      });
    } catch (failure) {
      setError(authErrorMessage(failure));
      // Do not retain the password in React state or after a failed attempt.
      const password = form.elements.namedItem("contrasena");
      if (password instanceof HTMLInputElement) password.value = "";
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={pending} aria-describedby={error ? "sign-in-error" : undefined}>
      <Field>
        <FieldLabel htmlFor="identificador" className="mb-1.5 block">Usuario o correo electrónico <span className="text-red-500">*</span></FieldLabel>
        <Input id="identificador" name="identificador" type="text" autoComplete="username" maxLength={255} placeholder="Usuario o correo electrónico" required disabled={pending} />
      </Field>
      <Field>
        <FieldLabel htmlFor="contrasena" className="mb-1.5 block">Contraseña <span className="text-red-500">*</span></FieldLabel>
        <InputGroup>
          <InputGroupInput id="contrasena" name="contrasena" autoComplete="current-password" type={showPassword ? "text" : "password"} maxLength={128} placeholder="Introduce tu contraseña" required disabled={pending} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" disabled={pending} onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword}
              className="text-gray-500 dark:text-gray-400">
              {showPassword ? <EyeIcon className="fill-current" /> : <EyeCloseIcon className="fill-current" />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      {error && <p id="sign-in-error" role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button className="w-full" size="lg" type="submit" disabled={pending}>{pending ? "Iniciando sesión…" : "Iniciar sesión"}</Button>
    </form>
  );
}
