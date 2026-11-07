import { useEffect, useRef, useState, type ComponentProps } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { EyeCloseIcon, EyeIcon } from "@/icons";

type PasswordInputProps = Omit<ComponentProps<"input">, "type" | "value" | "defaultValue" | "ref"> & {
  toggleLabel: string;
};

/** Uncontrolled: only visibility is stored here; callers read secrets through FormData. */
export function PasswordInput({ toggleLabel, disabled, onChange, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = inputRef.current?.form;
    const resetVisibility = () => setVisible(false);
    form?.addEventListener("reset", resetVisibility);
    return () => form?.removeEventListener("reset", resetVisibility);
  }, []);

  return <InputGroup>
    <InputGroupInput {...props} ref={inputRef} type={visible ? "text" : "password"} disabled={disabled} onChange={event => {
      if (!event.currentTarget.value) setVisible(false);
      onChange?.(event);
    }} />
    <InputGroupAddon align="inline-end">
      <InputGroupButton size="icon-sm" disabled={disabled} onClick={() => setVisible(previous => !previous)}
        aria-label={`${visible ? "Ocultar" : "Mostrar"} ${toggleLabel}`} aria-pressed={visible} className="text-gray-500 dark:text-gray-400">
        {visible ? <EyeIcon aria-hidden="true" className="fill-current" /> : <EyeCloseIcon aria-hidden="true" className="fill-current" />}
      </InputGroupButton>
    </InputGroupAddon>
  </InputGroup>;
}
