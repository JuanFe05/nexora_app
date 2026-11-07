// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Badge } from "./badge";

afterEach(cleanup);

describe("Badge", () => {
  it.each([
    ["success", "green"], ["error", "red"], ["warning", "amber"], ["info", "blue"],
  ] as const)("renders the %s semantic tint in both themes", (variant, color) => {
    render(<Badge variant={variant}>Estado</Badge>);
    const badge = screen.getByText("Estado");
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveAttribute("data-variant", variant);
    expect(badge).toHaveClass(`bg-${color}-50`, `text-${color}-700`, `dark:bg-${color}-500/15`, `dark:text-${color}-400`, "rounded-full");
  });

  it("defaults to neutral and forwards native attributes and layout classes", () => {
    render(<Badge aria-label="Estado del usuario" className="self-start">Pendiente</Badge>);
    const badge = screen.getByLabelText("Estado del usuario");
    expect(badge).toHaveTextContent("Pendiente");
    expect(badge).toHaveAttribute("data-variant", "neutral");
    expect(badge).toHaveClass("bg-gray-100", "text-gray-700", "dark:bg-white/5", "dark:text-gray-400", "self-start");
  });
});
