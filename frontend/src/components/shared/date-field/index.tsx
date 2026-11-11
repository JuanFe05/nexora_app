import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";

type DateFieldProps = Omit<
  ComponentProps<"input">,
  "type" | "onChange" | "value" | "id"
> & {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export function DateField({
  id,
  label,
  value,
  onChange,
  error,
  required,
  "aria-describedby": describedBy,
  ...props
}: DateFieldProps) {
  const description =
    [describedBy, error ? `${id}-error` : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="min-w-0 space-y-2">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-red-500">
            *
          </span>
        )}
      </label>
      <Input
        {...props}
        id={id}
        type="date"
        className="dark:scheme-dark"
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={description}
      />
      {error && (
        <p
          id={`${id}-error`}
          className="text-sm text-red-500 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}
