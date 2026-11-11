// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DateField } from "./index";
afterEach(cleanup);
it("labels a native date field, forwards changes and associates required errors", () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <DateField
      id="start"
      label="Fecha inicial"
      value=""
      onChange={onChange}
      required
      error="La fecha inicial es obligatoria."
    />,
  );
  const input = screen.getByLabelText(/Fecha inicial/);
  expect(input).toHaveAttribute("type", "date");
  expect(input).toBeRequired();
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("La fecha inicial es obligatoria.");
  fireEvent.change(input, { target: { value: "2026-01-31" } });
  expect(onChange).toHaveBeenCalledWith("2026-01-31");
  rerender(
    <DateField
      id="start"
      label="Fecha inicial"
      value="2026-01-31"
      onChange={onChange}
      disabled
    />,
  );
  expect(input).toHaveValue("2026-01-31");
  expect(input).toBeDisabled();
  expect(input).not.toHaveAttribute("aria-describedby");
});
