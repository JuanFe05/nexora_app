import { useRef, useState, type FormEvent } from "react";
import { useToast } from "@/components/shared/toast/use-toast";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { LockIcon, PlusIcon, XIcon } from "@/icons";
import { MinusIcon } from "@/icons/minus";
import { CircleAlertIcon } from "@/icons/circle-alert";
import { NumberStepperInput } from "./number-stepper-input";
import { moderatorFeesErrorMessage, saveModeratorFees } from "../api/moderator-fees-api";
import type { ModeratorFees } from "../types";

type Props = { fee?: ModeratorFees; onClose: () => void; onSaved: () => void };
type Errors = { vigencia?: string; importes?: string[] };
const MAX_AMOUNT = 1_000_000;
const helperClass = "text-xs leading-relaxed text-gray-500 dark:text-gray-400";

function FieldError({ id, children }: { id: string; children: string }) {
  return <p id={id} className="flex items-start gap-1.5 text-sm text-red-500 dark:text-red-400">
    <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{children}
  </p>;
}

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
      if (!integerInRange(value, 1, MAX_AMOUNT)) return "El importe debe ser un entero entre 1 y 1.000.000.";
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
    <Dialog open onOpenChange={open => { if (!open && !submitting.current) onClose(); }}>
      <DialogContent showCloseButton={false} aria-busy={pending}
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-xl">
        <DialogHeader className="pe-7">
          <DialogTitle>{fee ? "Editar vigencia" : "Nueva vigencia"}</DialogTitle>
          <DialogDescription>Define las cuotas moderadoras de la vigencia. Los importes se guardan en pesos colombianos (COP).</DialogDescription>
        </DialogHeader>
        <DialogClose disabled={pending} render={<Button type="button" variant="ghost" size="icon-sm" className="absolute end-3 top-3 rounded-full text-gray-400" />}>
          <XIcon aria-hidden="true" /><span className="sr-only">Cerrar</span>
        </DialogClose>
        <div className="-mx-2 overflow-y-auto px-2 py-1">
          <form ref={formRef} id="moderator-fees-form" noValidate onSubmit={submit} className="space-y-6 py-2">
            <Field controlId="moderator-fees-vigencia" data-invalid={Boolean(errors.vigencia)}>
              <FieldLabel>Vigencia</FieldLabel>
              <div className="relative">
                <Input name="vigencia" type="text" inputMode="numeric" required value={vigencia} readOnly={Boolean(fee)} disabled={pending}
                  placeholder="Ej. 2027" className={fee ? "pe-11 read-only:bg-gray-50 read-only:text-gray-500 dark:read-only:bg-gray-800/50 dark:read-only:text-gray-400" : "enabled:hover:border-gray-400 dark:enabled:hover:border-gray-500"}
                  aria-invalid={Boolean(errors.vigencia)} aria-describedby={errors.vigencia ? "moderator-fees-vigencia-error" : "moderator-fees-vigencia-help"}
                  onChange={event => { setVigencia(event.target.value); setErrors(current => ({ ...current, vigencia: undefined })); }} />
                {fee && <LockIcon aria-hidden="true" className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />}
              </div>
              {errors.vigencia ? <FieldError id="moderator-fees-vigencia-error">{errors.vigencia}</FieldError> :
                <p id="moderator-fees-vigencia-help" className={helperClass}>{fee ? "La vigencia no se puede modificar al editar." : "Ingresa un año entre 2000 y 2100."}</p>}
            </Field>
            <fieldset className="min-w-0 space-y-4" disabled={pending}>
              <legend className="mb-1 flex w-full items-center justify-between gap-3 text-sm font-medium text-gray-800 dark:text-gray-200">
                Importes en COP <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs tabular-nums text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">{importes.length} / 10</span>
              </legend>
              <p id="moderator-fees-amounts-help" className={helperClass}>Entre $1 y $1.000.000, enteros y sin repetir. Usa + / − o las flechas ↑ / ↓ para ajustar $1.000; también puedes escribir el valor exacto.</p>
              <div className="space-y-3">
                {importes.map((item, index) => {
                  const id = `moderator-fees-importe-${item.id}`;
                  const error = errors.importes?.[index];
                  return <div key={item.id} className="flex flex-col items-start gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3 sm:flex-row sm:gap-3 dark:border-gray-800 dark:bg-gray-900/30">
                    <Field controlId={id} data-invalid={Boolean(error)} className="min-w-0 flex-1">
                      <FieldLabel>Importe {index + 1}</FieldLabel>
                      <NumberStepperInput name={`importe-${item.id}`} min={1} max={MAX_AMOUNT} step={1000} required value={item.value} disabled={pending}
                        incrementLabel={`Aumentar importe ${index + 1}`} decrementLabel={`Disminuir importe ${index + 1}`}
                        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : "moderator-fees-amounts-help"}
                        onChange={value => {
                          setImportes(current => current.map(entry => entry.id === item.id ? { ...entry, value } : entry));
                          setErrors(current => ({ ...current, importes: undefined }));
                        }} />
                      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
                    </Field>
                    <Button type="button" variant="ghost" size="lg" className="self-end px-3 text-gray-400 hover:bg-red-50 hover:text-red-600 focus-visible:ring-brand-500/20 sm:mt-6 sm:self-start dark:hover:bg-red-500/10 dark:hover:text-red-400"
                      aria-label={`Quitar importe ${index + 1}`} disabled={pending || importes.length <= 1}
                      onClick={() => { setImportes(current => current.filter(entry => entry.id !== item.id)); setErrors(current => ({ ...current, importes: undefined })); }}>
                      <MinusIcon aria-hidden="true" className="size-4" /><span>Quitar</span>
                    </Button>
                  </div>;
                })}
              </div>
              <div className="space-y-2">
                <Button type="button" variant="outline" size="lg" className="w-full border-dashed hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 focus-visible:ring-brand-500/20 sm:w-auto dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10 dark:hover:text-brand-400"
                  disabled={pending || importes.length >= 10} aria-describedby={importes.length >= 10 ? "moderator-fees-count-help" : undefined} onClick={() => {
                    const id = nextId.current++;
                    setImportes(current => [...current, { id, value: "" }]);
                  }}><PlusIcon aria-hidden="true" className="size-4" />Agregar importe</Button>
                {importes.length >= 10 && <p id="moderator-fees-count-help" className={helperClass}>Has alcanzado el máximo de 10 importes.</p>}
              </div>
            </fieldset>
          </form>
        </div>
        <DialogFooter className="border-t border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/30">
          <Button type="button" variant="outline" size="lg" disabled={pending} className="focus-visible:ring-brand-500/20" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="moderator-fees-form" size="lg" disabled={pending} aria-label={pending ? "Guardando…" : "Guardar"}>
            {pending && <Spinner aria-label="Guardando" />}{pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
