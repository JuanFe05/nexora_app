// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KeyIcon } from "@/icons";
import { CountIndicator } from "./count-indicator";

afterEach(cleanup);

describe("CountIndicator", () => {
  it.each([0, 12, 1234])("renders count %s with accessible text and neutral theme tokens", count => {
    render(<CountIndicator icon={<KeyIcon />} count={count} label={`${count} permisos`} />);
    const indicator = screen.getByLabelText(`${count} permisos`);
    expect(indicator).toHaveTextContent(String(count));
    expect(indicator).toHaveClass("rounded-full", "tabular-nums", "bg-gray-100", "text-gray-700", "dark:bg-white/5", "dark:text-gray-300");
    const icon = indicator.querySelector('[aria-hidden="true"]');
    expect(icon).toHaveClass("size-4");
    expect(icon?.querySelector("svg")).toBeInTheDocument();
    expect(indicator).not.toHaveAttribute("title");
  });

  it("accepts an icon component and forwards the optional tooltip", () => {
    render(<CountIndicator icon={KeyIcon} count={12} label="12 permisos" title="Permisos asignados" />);
    const indicator = screen.getByLabelText("12 permisos");
    expect(indicator).toHaveAttribute("title", "Permisos asignados");
    expect(indicator.querySelector('[aria-hidden="true"] svg')).toBeInTheDocument();
  });
});
