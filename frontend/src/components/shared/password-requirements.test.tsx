// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { evaluatePasswordPolicy, PASSWORD_RULES } from "@/lib/password-policy";
import { PasswordRequirements } from "./password-requirements";

afterEach(cleanup);
it("lists all accessible states and politely announces progress without receiving a secret", () => {
  const { rerender, container } = render(<PasswordRequirements evaluation={evaluatePasswordPolicy("")} />);
  const list = screen.getByRole("list", { name: "Requisitos de contraseña" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(5);
  for (const rule of PASSWORD_RULES) expect(within(list).getByText(rule.label)).toBeVisible();
  expect(within(list).getAllByText("pendiente")).toHaveLength(5);
  for (const item of within(list).getAllByRole("listitem")) {
    expect(item).toHaveClass("text-gray-500", "dark:text-gray-400");
    expect(item.querySelector('[aria-hidden="true"]')).toHaveClass("rounded-full", "border-current");
    expect(item.querySelector("svg")).toBeNull();
  }
  expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  expect(screen.getByRole("status")).toHaveTextContent("0 de 5 requisitos cumplidos.");
  rerender(<PasswordRequirements evaluation={evaluatePasswordPolicy("Abc123!x")} />);
  expect(within(list).getAllByText("cumplido")).toHaveLength(5);
  for (const item of within(list).getAllByRole("listitem")) {
    expect(item).toHaveClass("text-green-600", "dark:text-green-400");
    expect(item.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  }
  expect(screen.getByRole("status")).toHaveTextContent("5 de 5 requisitos cumplidos.");
  expect(container.innerHTML).not.toContain("Abc123!x");
});

it("marks only unmet rules red after validation while preserving met rules and accessible states", () => {
  render(<PasswordRequirements evaluation={evaluatePasswordPolicy("abc12!")} showErrors />);
  const list = screen.getByRole("list", { name: "Requisitos de contraseña" });
  const failed = within(list).getByText("incumplido").closest("li");
  expect(failed).toHaveTextContent("Al menos una letra mayúscula");
  expect(failed).toHaveClass("text-red-600", "dark:text-red-400");
  expect(failed?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(within(list).queryByText("pendiente")).not.toBeInTheDocument();
  for (const state of within(list).getAllByText("cumplido")) expect(state.closest("li")).toHaveClass("text-green-600", "dark:text-green-400");
  expect(screen.getByRole("status")).toHaveTextContent("4 de 5 requisitos cumplidos.");
});
