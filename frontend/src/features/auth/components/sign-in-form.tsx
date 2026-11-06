import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { authErrorMessage } from "../error-message";
import { useAuth } from "../use-auth";
import { validateSignIn, type SignInErrors } from "../validation";

export default function SignInForm() {
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignInErrors>({});
  const [rejectedFields, setRejectedFields] = useState({ identificador: false, contrasena: false });

  function clearField(field: keyof SignInErrors) {
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
    setRejectedFields((previous) => ({ ...previous, [field]: false }));
    setError(null);
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const identifier = data.get("identificador");
    const passwordValue = data.get("contrasena");
    const input = {
      identificador: typeof identifier === "string" ? identifier.trim() : "",
      contrasena: typeof passwordValue === "string" ? passwordValue : "",
    };
    const errors = validateSignIn(input);
    setFieldErrors(errors);
    setError(null);
    setRejectedFields({ identificador: false, contrasena: false });
    const firstInvalid = errors.identificador ? "identificador" : errors.contrasena ? "contrasena" : null;
    if (firstInvalid) {
      const field = form.elements.namedItem(firstInvalid);
      if (field instanceof HTMLInputElement) field.focus();
      return;
    }
    setPending(true);
    try {
      await login(input);
    } catch (failure) {
      setError(authErrorMessage(failure));
      setRejectedFields({ identificador: true, contrasena: true });
      // Do not retain the password in React state or after a failed attempt.
      const password = form.elements.namedItem("contrasena");
      if (password instanceof HTMLInputElement) password.value = "";
    } finally {
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-5" aria-busy={pending} aria-describedby={error ? "sign-in-error" : undefined}>
      <Field>
        <FieldLabel htmlFor="identificador" className="mb-1.5 block">Usuario o correo electrónico <span aria-hidden="true" className="text-red-500">*</span></FieldLabel>
        <Input id="identificador" name="identificador" type="text" autoComplete="username" maxLength={255} placeholder="Usuario o correo electrónico" required disabled={pending}
          className="placeholder:text-gray-400 dark:placeholder:text-gray-400"
          aria-invalid={Boolean(fieldErrors.identificador) || rejectedFields.identificador}
          aria-describedby={fieldErrors.identificador ? "identificador-error" : error ? "sign-in-error" : undefined}
          onChange={() => clearField("identificador")} />
        {fieldErrors.identificador && <p id="identificador-error" role="alert" className="text-sm text-red-600 dark:text-red-400">{fieldErrors.identificador}</p>}
      </Field>
      <Field>
        <FieldLabel htmlFor="contrasena" className="mb-1.5 block">Contraseña <span aria-hidden="true" className="text-red-500">*</span></FieldLabel>
        <InputGroup>
          <InputGroupInput id="contrasena" name="contrasena" autoComplete="current-password" type={showPassword ? "text" : "password"} maxLength={128} placeholder="Introduce tu contraseña" required disabled={pending}
            className="placeholder:text-gray-400 dark:placeholder:text-gray-400"
            aria-invalid={Boolean(fieldErrors.contrasena) || rejectedFields.contrasena}
            aria-describedby={fieldErrors.contrasena ? "contrasena-error" : error ? "sign-in-error" : undefined}
            onChange={() => clearField("contrasena")} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-sm" disabled={pending} onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword}
              className="text-gray-500 dark:text-gray-400">
              {showPassword ? <EyeIcon aria-hidden="true" className="fill-current" /> : <EyeCloseIcon aria-hidden="true" className="fill-current" />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {fieldErrors.contrasena && <p id="contrasena-error" role="alert" className="text-sm text-red-600 dark:text-red-400">{fieldErrors.contrasena}</p>}
      </Field>
      {error && <p id="sign-in-error" role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button className="w-full" size="lg" type="submit" disabled={pending}>{pending ? "Iniciando sesión…" : "Iniciar sesión"}</Button>
    </form>
  );
}
