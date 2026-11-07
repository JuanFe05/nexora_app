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
  expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  expect(screen.getByRole("status")).toHaveTextContent("0 de 5 requisitos cumplidos.");
  rerender(<PasswordRequirements evaluation={evaluatePasswordPolicy("Abc123!x")} />);
  expect(within(list).getAllByText("cumplido")).toHaveLength(5);
  expect(screen.getByRole("status")).toHaveTextContent("5 de 5 requisitos cumplidos.");
  expect(container.innerHTML).not.toContain("Abc123!x");
});
