// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ThemeProvider } from "@/contexts/theme-context";
import ThemeToggleButton from "./index";

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

it("alterna luna/sol, estado accesible, clase dark y persistencia con ThemeProvider real", async () => {
  const user = userEvent.setup();
  const view = render(<ThemeProvider><ThemeToggleButton /></ThemeProvider>);
  const button = screen.getByRole("button", { name: "Activar tema oscuro" });
  expect(button).toHaveAttribute("aria-pressed", "false");
  expect(button.querySelector("svg")).toHaveAttribute("data-theme-icon", "moon");
  expect(document.documentElement).not.toHaveClass("dark");
  await user.click(button);
  expect(screen.getByRole("button", { name: "Activar tema claro" })).toHaveAttribute("aria-pressed", "true");
  expect(button.querySelector("svg")).toHaveAttribute("data-theme-icon", "sun");
  expect(document.documentElement).toHaveClass("dark");
  expect(localStorage.getItem("theme-mode")).toBe("dark");
  expect(localStorage.getItem("theme")).toBe("dark");
  view.unmount();
  render(<ThemeProvider><ThemeToggleButton /></ThemeProvider>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Activar tema claro" })).toHaveAttribute("aria-pressed", "true"));
  await user.click(screen.getByRole("button", { name: "Activar tema claro" }));
  expect(document.documentElement).not.toHaveClass("dark");
  expect(localStorage.getItem("theme-mode")).toBe("light");
  expect(localStorage.getItem("theme")).toBe("light");
});
