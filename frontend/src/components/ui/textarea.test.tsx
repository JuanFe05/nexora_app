// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Field, FieldLabel } from "./field";
import { Textarea } from "./textarea";

afterEach(cleanup);
describe("Textarea", () => {
  it("uses Input's light/dark, focus, invalid and disabled styles with a resizable minimum height", () => {
    render(<Textarea aria-label="Descripción" aria-invalid disabled className="custom" />);
    const textarea = screen.getByRole("textbox", { name: "Descripción" });
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveAttribute("data-slot", "textarea");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveClass("min-h-28", "resize-y", "rounded-[10px]", "border-gray-300", "bg-white", "shadow-theme-xs", "focus:ring-3", "focus-visible:ring-3", "aria-invalid:border-red-500", "aria-invalid:ring-red-500/20", "disabled:cursor-not-allowed", "disabled:bg-gray-100/50", "dark:border-gray-700", "dark:bg-gray-900", "dark:aria-invalid:border-red-500/50", "dark:disabled:bg-gray-800/50", "custom");
  });
  it("inherits Field's id and forwards native props, including explicit id overrides", () => {
    const { rerender } = render(<Field controlId="description"><FieldLabel>Descripción</FieldLabel><Textarea name="descripcion" maxLength={255} defaultValue="Texto" aria-describedby="hint" /></Field>);
    expect(screen.getByLabelText("Descripción")).toHaveAttribute("id", "description");
    expect(screen.getByLabelText("Descripción")).toHaveAttribute("maxlength", "255");
    expect(screen.getByLabelText("Descripción")).toHaveAttribute("aria-describedby", "hint");
    expect(screen.getByLabelText("Descripción")).toHaveValue("Texto");
    rerender(<Field controlId="description"><Textarea id="explicit" aria-label="Texto" readOnly /></Field>);
    expect(screen.getByRole("textbox")).toHaveAttribute("id", "explicit");
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
  });
});
