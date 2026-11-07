// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";

afterEach(cleanup);

describe("StatusBadge", () => {
  it.each([
    ["activo", "Activo", "success", "green"],
    ["ACTIVO", "Activo", "success", "green"],
    ["inactivo", "Inactivo", "error", "red"],
    ["INACTIVO", "Inactivo", "error", "red"],
    ["AcTiVo", "Activo", "success", "green"],
  ])("maps %s to the shared semantic badge", (estado, text, variant, color) => {
    render(<StatusBadge estado={estado} />);
    const badge = screen.getByText(text);
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveAttribute("data-variant", variant);
    expect(badge).toHaveClass(`bg-${color}-50`, `text-${color}-700`, `dark:bg-${color}-500/15`, `dark:text-${color}-400`);
    expect(badge.querySelector("svg")).toBeNull();
  });

  it("preserves an unknown backend value verbatim in a neutral badge", () => {
    render(<StatusBadge estado="Pendiente DE revisión" />);
    expect(screen.getByText("Pendiente DE revisión")).toHaveAttribute("data-variant", "neutral");
  });
});
