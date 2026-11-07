// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { FormEvent } from "react";
import { PasswordInput } from "./password-input";

afterEach(cleanup);
it("toggles an uncontrolled input with accessible names and resets on clear and form reset", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn(); const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
  render(<form onSubmit={onSubmit}><label htmlFor="secret">Contraseña</label><PasswordInput id="secret" name="secret" toggleLabel="contraseña" onChange={onChange} required autoComplete="new-password" /></form>);
  const input = screen.getByLabelText("Contraseña") as HTMLInputElement;
  const button = screen.getByRole("button", { name: "Mostrar contraseña" });
  expect(input).toHaveAttribute("type", "password");
  expect(input).toBeRequired(); expect(input).toHaveAttribute("autocomplete", "new-password");
  expect(button).toHaveAttribute("aria-pressed", "false");
  await user.type(input, "Abc123!x");
  await user.click(button);
  expect(input).toHaveAttribute("type", "text");
  expect(button).toHaveAccessibleName("Ocultar contraseña");
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(input).not.toHaveAttribute("value");
  expect(document.body.innerHTML).not.toContain("Abc123!x");
  expect(new FormData(input.form!).get("secret")).toBe("Abc123!x");
  await user.clear(input);
  expect(input).toHaveAttribute("type", "password");
  expect(button).toHaveAccessibleName("Mostrar contraseña");
  expect(button).toHaveAttribute("aria-pressed", "false");
  await user.type(input, "Abc123!x"); await user.click(button);
  act(() => input.form!.reset());
  expect(input).toHaveValue(""); expect(input).toHaveAttribute("type", "password");
  expect(button).toHaveAttribute("aria-pressed", "false");
  expect(onChange).toHaveBeenCalled(); expect(onSubmit).not.toHaveBeenCalled();
});
it("disables both the input and visibility control while pending", () => {
  render(<PasswordInput aria-label="Contraseña" toggleLabel="contraseña" disabled />);
  expect(screen.getByLabelText("Contraseña")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Mostrar contraseña" })).toBeDisabled();
});
