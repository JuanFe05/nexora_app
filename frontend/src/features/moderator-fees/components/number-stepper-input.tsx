import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MinusIcon } from "@/icons/minus";
import { PlusIcon } from "@/icons/plus";

const formatter = new Intl.NumberFormat("es-CO");
type Props = Omit<ComponentProps<"input">, "value" | "onChange" | "min" | "max" | "step" | "type" | "onFocus" | "onBlur" | "onKeyDown"> & {
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step: number;
  incrementLabel: string;
  decrementLabel: string;
};

/** Raw digits while editing keep the caret stable; formatting never changes the stored value. */
export function NumberStepperInput({ value, onChange, min, max, step, incrementLabel, decrementLabel, disabled, readOnly, ...props }: Props) {
  const [focused, setFocused] = useState(false);
  const integer = /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
  const number = integer ? Number(value) : undefined;
  const locked = disabled || readOnly;
  function adjust(direction: number) {
    if (locked) return;
    onChange(String(Math.min(max, Math.max(min, number === undefined ? min : number + direction * step))));
  }
  return (
    <div className="relative min-w-0">
      <span aria-hidden="true" className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500">$</span>
      <Input {...props} type="text" inputMode="numeric" role="spinbutton" aria-valuemin={min} aria-valuemax={max} aria-valuenow={number}
        value={!focused && number !== undefined ? formatter.format(number) : value} disabled={disabled} readOnly={readOnly}
        className="ps-8 pe-24 tabular-nums enabled:hover:border-gray-400 dark:enabled:hover:border-gray-500"
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            adjust(event.key === "ArrowUp" ? 1 : -1);
          }
        }} />
      <div className="absolute end-1.5 top-1/2 flex -translate-y-1/2 gap-1 border-s border-gray-200 ps-1.5 dark:border-gray-700">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={decrementLabel} disabled={locked || (number !== undefined && number <= min)}
          className="text-gray-500 hover:bg-brand-50 hover:text-brand-600 focus-visible:ring-brand-500/20 dark:hover:bg-brand-500/10 dark:hover:text-brand-400"
          onClick={() => adjust(-1)}><MinusIcon aria-hidden="true" className="size-4" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={incrementLabel} disabled={locked || (number !== undefined && number >= max)}
          className="text-gray-500 hover:bg-brand-50 hover:text-brand-600 focus-visible:ring-brand-500/20 dark:hover:bg-brand-500/10 dark:hover:text-brand-400"
          onClick={() => adjust(1)}><PlusIcon aria-hidden="true" className="size-4" /></Button>
      </div>
    </div>
  );
}
