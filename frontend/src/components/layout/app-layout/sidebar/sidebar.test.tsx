// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { navigation } from "@/config/navigation";
import AppSidebar from "./index";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
afterEach(cleanup);

it("cada entrada configura un icono y conserva Inicio → /", () => {
  expect(navigation).toHaveLength(1);
  expect(navigation[0]).toMatchObject({ label: "Inicio", path: "/", icon: expect.any(Function) });
});

it.each([true, false])("renderiza el icono configurado con sidebar expandido=%s", (open) => {
  render(<MemoryRouter><SidebarProvider defaultOpen={open}><AppSidebar /></SidebarProvider></MemoryRouter>);
  const link = screen.getByRole("link", { name: "Inicio" });
  expect(link).toHaveAttribute("href", "/");
  expect(link).toHaveAttribute("aria-current", "page");
  const icon = link.querySelector("svg");
  expect(icon).toHaveClass("size-6", "menu-item-icon-active");
  expect(icon).toHaveAttribute("aria-hidden", "true");
});
