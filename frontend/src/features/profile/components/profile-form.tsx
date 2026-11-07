import { useState, type SubmitEvent } from "react";
import { useToast } from "@/components/shared/toast/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UserCircleIcon } from "@/icons";
import { profileFailure, updateProfile } from "../api/profile-api";
import { useFormFocus } from "../hooks/use-form-focus";
import { profileFields, type FieldErrors, type Profile, type ProfileField } from "../types";
import { changedProfileFields, toProfileValues, validateProfile } from "../validation";

const labels: Record<ProfileField, string> = {
  primer_nombre: "Primer nombre", segundo_nombre: "Segundo nombre", primer_apellido: "Primer apellido",
  segundo_apellido: "Segundo apellido", numero_telefono: "Teléfono", correo: "Correo electrónico",
};
const autocomplete: Record<ProfileField, string> = {
  primer_nombre: "given-name", segundo_nombre: "additional-name", primer_apellido: "family-name",
  segundo_apellido: "off", numero_telefono: "tel", correo: "email",
};

export function ProfileForm({ profile, onUpdated }: { profile: Profile; onUpdated: (profile: Profile) => void }) {
  const [values, setValues] = useState(() => toProfileValues(profile));
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<ProfileField>>({});
  const toast = useToast();
  const { formRef, focusField } = useFormFocus(pending);
  const changed = Object.keys(changedProfileFields(profile, values)).length > 0;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !changed) return;
    const invalid = validateProfile(values, profile);
    setErrors(invalid);
    const first = profileFields.find((field) => invalid[field]);
    if (first) { focusField(first); return; }
    setPending(true);
    try {
      const updated = await updateProfile(profile, values);
      setValues(toProfileValues(updated)); onUpdated(updated);
      toast.success("Datos actualizados");
    } catch (error) {
      const failure = profileFailure(error);
      setErrors(failure.fields);
      if (failure.message) toast.error(failure.message);
      focusField(profileFields.find((field) => failure.fields[field]));
    } finally { setPending(false); }
  }

  return (
    <Card className="min-w-0" aria-labelledby="personal-title">
      <h2 id="personal-title" className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
        <UserCircleIcon aria-hidden="true" className="size-6" />Datos personales
      </h2>
      <form ref={formRef} noValidate onSubmit={submit} aria-labelledby="personal-title" aria-busy={pending} className="space-y-5">
        <Field>
          <FieldLabel htmlFor="profile-username">Nombre de usuario</FieldLabel>
          <Input id="profile-username" name="nombre_usuario" readOnly value={profile.nombre_usuario} autoComplete="username" aria-describedby="username-hint" />
          <p id="username-hint" className="text-xs text-gray-500 dark:text-gray-400">El nombre de usuario no se puede modificar.</p>
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {profileFields.map((field) => {
            const required = field === "correo" || field === "primer_nombre" || field === "primer_apellido";
            const id = `profile-${field}`;
            return <Field key={field} className={field === "correo" ? "sm:col-span-2" : undefined}>
              <FieldLabel htmlFor={id}>{labels[field]}{required && <span aria-hidden="true" className="text-red-500">*</span>}</FieldLabel>
              <Input id={id} name={field} type={field === "correo" ? "email" : field === "numero_telefono" ? "tel" : "text"}
                required={required} autoComplete={autocomplete[field]} disabled={pending} value={values[field]}
                aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `${id}-error` : undefined}
                onChange={(event) => {
                  setValues((previous) => ({ ...previous, [field]: event.target.value }));
                  setErrors((previous) => ({ ...previous, [field]: undefined }));
                }} />
              {errors[field] && <p id={`${id}-error`} role="alert" className="text-sm text-red-600 dark:text-red-400">{errors[field]}</p>}
            </Field>;
          })}
        </div>
        <Button type="submit" disabled={pending || !changed} className="w-full sm:w-auto">{pending ? "Guardando…" : "Guardar cambios"}</Button>
      </form>
    </Card>
  );
}
