// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DateField } from "./index";

afterEach(cleanup);

type PickerInput = HTMLInputElement & {
  _flatpickr: { setDate(date: string, trigger: boolean, format: string): void };
};

it("disables future days in the calendar through maxDate", () => {
  const onChange = vi.fn();
  render(
    <DateField
      id="end"
      label="Fecha final"
      value=""
      onChange={onChange}
      maxDate="2026-01-10"
    />,
  );
  const input = screen.getByLabelText(/Fecha final/) as PickerInput & {
    _flatpickr: PickerInput["_flatpickr"] & {
      isEnabled(date: Date): boolean;
    };
  };
  expect(input._flatpickr.isEnabled(new Date(2026, 0, 10))).toBe(true);
  expect(input._flatpickr.isEnabled(new Date(2026, 0, 11))).toBe(false);
  act(() => input._flatpickr.setDate("2026-01-10", true, "Y-m-d"));
  expect(onChange).toHaveBeenCalledWith("2026-01-10");
});
it("labels a TailAdmin date picker, shows dd/mm/aaaa, emits ISO dates and associates required errors", () => {
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
  const input = screen.getByLabelText(/Fecha inicial/) as PickerInput;
  expect(input).toHaveAttribute("placeholder", "dd/mm/aaaa");
  expect(input).toBeRequired();
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("La fecha inicial es obligatoria.");
  act(() => input._flatpickr.setDate("2026-01-31", true, "Y-m-d"));
  expect(onChange).toHaveBeenCalledWith("2026-01-31");
  expect(input).toHaveValue("31/01/2026");
  onChange.mockClear();
  rerender(
    <DateField
      id="start"
      label="Fecha inicial"
      value="2026-02-15"
      onChange={onChange}
      disabled
    />,
  );
  expect(input).toHaveValue("15/02/2026");
  expect(input).toBeDisabled();
  expect(input).not.toHaveAttribute("aria-describedby");
  rerender(
    <DateField id="start" label="Fecha inicial" value="" onChange={onChange} />,
  );
  expect(input).toHaveValue("");
  expect(onChange).not.toHaveBeenCalled();
});
