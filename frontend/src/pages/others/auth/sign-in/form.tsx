import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { useState } from "react";

export default function SignInFormFields() {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form onSubmit={(event) => event.preventDefault()} className="space-y-5" aria-describedby="sign-in-pending">
      <Field>
        <FieldLabel className="mb-1.5 block">Correo electrónico <span className="text-red-500">*</span></FieldLabel>
        <Input name="email" type="email" autoComplete="username" placeholder="info@gmail.com" required />
      </Field>
      <Field>
        <FieldLabel className="mb-1.5 block">Contraseña <span className="text-red-500">*</span></FieldLabel>
        <InputGroup>
          <InputGroupInput name="password" autoComplete="current-password" type={showPassword ? "text" : "password"} placeholder="Introduce tu contraseña" required />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword}
              className="text-gray-500 dark:text-gray-400">
              {showPassword ? <EyeIcon className="fill-current" /> : <EyeCloseIcon className="fill-current" />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <Field orientation="horizontal" className="w-auto items-center gap-3">
        <Checkbox name="keepLoggedIn" />
        <FieldLabel className="block cursor-pointer text-sm font-normal text-gray-700 dark:text-gray-400">Mantener la sesión iniciada</FieldLabel>
      </Field>
      <Button className="w-full" size="lg" type="submit" disabled>Iniciar sesión</Button>
      <p id="sign-in-pending" className="text-sm text-gray-500 dark:text-gray-400">Inicio de sesión pendiente de conexión con el servidor.</p>
    </form>
  );
}
