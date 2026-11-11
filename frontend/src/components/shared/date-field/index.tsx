import { useEffect, useEffectEvent, useRef } from "react";
import flatpickr from "flatpickr";
import { Spanish } from "flatpickr/dist/l10n/es.js";
import "flatpickr/dist/flatpickr.css";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CalendarIcon } from "@/icons";

type DateFieldProps = {
  id: string;
  label: string;
  /** ISO date (YYYY-MM-DD) or empty; the visible text is formatted as dd/mm/aaaa. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Latest selectable date: "today" or an ISO date; later days are disabled in the calendar. */
  maxDate?: string;
  "aria-describedby"?: string;
};

const ISO_FORMAT = "Y-m-d";

/** TailAdmin "Date Picker Input": flatpickr over a text input with the calendar icon at its end. */
export function DateField({
  id,
  label,
  value,
  onChange,
  error,
  required,
  disabled,
  maxDate,
  "aria-describedby": describedBy,
}: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<flatpickr.Instance | null>(null);
  const emit = useEffectEvent((next: string) => onChange(next));
  const description =
    [describedBy, error ? `${id}-error` : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  useEffect(() => {
    if (!inputRef.current) return;
    const picker = flatpickr(inputRef.current, {
      mode: "single",
      dateFormat: "d/m/Y",
      locale: Spanish,
      maxDate:
        maxDate && maxDate !== "today"
          ? new Date(`${maxDate}T00:00:00`)
          : maxDate,
      onChange: ([date], _text, instance) =>
        emit(date ? instance.formatDate(date, ISO_FORMAT) : ""),
    });
    pickerRef.current = picker;
    return () => {
      picker.destroy();
      pickerRef.current = null;
    };
  }, [maxDate]);

  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;
    if (value) picker.setDate(value, false, ISO_FORMAT);
    else picker.clear(false);
  }, [value, maxDate]);

  return (
    <Field controlId={id} className="min-w-0">
      <FieldLabel>
        {label}
        {required && (
          <span aria-hidden="true" className="text-red-500">
            *
          </span>
        )}
      </FieldLabel>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          placeholder="dd/mm/aaaa"
          className="pe-10"
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={description}
        />
        <span className="pointer-events-none absolute inset-e-3.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
          <CalendarIcon className="size-5" />
        </span>
      </div>
      {error && (
        <p
          id={`${id}-error`}
          className="text-sm text-red-500 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </Field>
  );
}
