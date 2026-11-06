import { useLayoutEffect, useRef } from "react";

/** Resolve focus after disabled controls are re-enabled by React. */
export function useFormFocus(pending: boolean) {
  const formRef = useRef<HTMLFormElement>(null);
  const target = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (pending || !target.current) return;
    const input = formRef.current?.elements.namedItem(target.current);
    if (input instanceof HTMLInputElement) input.focus();
    target.current = null;
  });
  function focusField(name: string | undefined) { target.current = name ?? null; }
  return { formRef, focusField };
}
