import { useRef, useState, type FormEvent } from "react";
import { FormDialog } from "@/components/shared/form-dialog";
import { useToast } from "@/components/shared/toast/use-toast";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { moderatorFeesErrorMessage, saveModeratorFees } from "../api/moderator-fees-api";
import type { ModeratorFees } from "../types";

type Props = { fee?: ModeratorFees; onClose: () => void; onSaved: () => void };
type Errors = { vigencia?: string; importes?: string[] };
const errorClass = "text-sm text-red-500 dark:text-red-400";

function integerInRange(value: string, min: number, max: number) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
}

export function ModeratorFeesFormDialog({ fee, onClose, onSaved }: Props) {
  const [vigencia, setVigencia] = useState(fee ? String(fee.vigencia) : "");
  const [importes, setImportes] = useState(() => (fee?.importes ?? [""]).map((value, id) => ({ id, value: String(value) })));
  const nextId = useRef(importes.length);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const nextErrors: Errors = {};
    if (!integerInRange(vigencia, 2000, 2100)) nextErrors.vigencia = "La vigencia debe ser un entero entre 2000 y 2100.";
    nextErrors.importes = importes.map(({ value }) => {
      if (!integerInRange(value, 1, 10000000)) return "El importe debe ser un entero entre 1 y 10.000.000.";
      if (importes.filter(item => Number(item.value) === Number(value)).length > 1) return "Los importes deben ser únicos.";
      return "";
    });
    setErrors(nextErrors);
    const invalidIndex = nextErrors.importes.findIndex(Boolean);
    if (nextErrors.vigencia || invalidIndex >= 0) {
      const name = nextErrors.vigencia ? "vigencia" : `importe-${importes[invalidIndex].id}`;
      (formRef.current?.elements.namedItem(name) as HTMLInputElement | null)?.focus();
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      await saveModeratorFees(fee?.vigencia ?? Number(vigencia), importes.map(item => Number(item.value)));
      onSaved();
    } catch (error: unknown) {
      toast.error(moderatorFeesErrorMessage(error));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <FormDialog open onOpenChange={open => { if (!open && !submitting.current) onClose(); }} title={fee ? "Editar vigencia" : "Nueva vigencia"}
      description="Configura entre 1 y 10 importes únicos en COP, enteros de 1 a 10.000.000. La vigencia debe estar entre 2000 y 2100 y no se puede modificar al editar."
      formId="moderator-fees-form" pending={pending}>
      <form ref={formRef} id="moderator-fees-form" noValidate onSubmit={submit} className="space-y-5 py-4">
        <Field controlId="moderator-fees-vigencia" data-invalid={Boolean(errors.vigencia)}>
          <FieldLabel>Vigencia</FieldLabel>
          <Input name="vigencia" type="number" min={2000} max={2100} step={1} required value={vigencia} readOnly={Boolean(fee)} disabled={pending}
            aria-invalid={Boolean(errors.vigencia)} aria-describedby={errors.vigencia ? "moderator-fees-vigencia-error" : undefined}
            onChange={event => { setVigencia(event.target.value); setErrors(current => ({ ...current, vigencia: undefined })); }} />
          {errors.vigencia && <p id="moderator-fees-vigencia-error" className={errorClass}>{errors.vigencia}</p>}
        </Field>
        <fieldset className="space-y-4" disabled={pending}>
          <legend className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Importes en COP (1–10)</legend>
          {importes.map((item, index) => {
            const id = `moderator-fees-importe-${item.id}`;
            const error = errors.importes?.[index];
            return <div key={item.id} className="flex items-start gap-3">
              <Field controlId={id} data-invalid={Boolean(error)} className="flex-1">
                <FieldLabel>Importe {index + 1}</FieldLabel>
                <Input name={`importe-${item.id}`} type="number" min={1} max={10000000} step={1} required value={item.value} disabled={pending}
                  aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
                  onChange={event => {
                    const value = event.target.value;
                    setImportes(current => current.map(entry => entry.id === item.id ? { ...entry, value } : entry));
                    setErrors(current => ({ ...current, importes: undefined }));
                  }} />
                {error && <p id={`${id}-error`} className={errorClass}>{error}</p>}
              </Field>
              <Button type="button" variant="outline" className="mt-7" aria-label={`Quitar importe ${index + 1}`} disabled={pending || importes.length <= 1}
                onClick={() => { setImportes(current => current.filter(entry => entry.id !== item.id)); setErrors(current => ({ ...current, importes: undefined })); }}>Quitar</Button>
            </div>;
          })}
          <Button type="button" variant="outline" disabled={pending || importes.length >= 10} onClick={() => {
            const id = nextId.current++;
            setImportes(current => [...current, { id, value: "" }]);
          }}>Agregar importe</Button>
        </fieldset>
      </form>
    </FormDialog>
  );
}
