// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { RequireRole } from "./route-guards";

const { auth } = vi.hoisted(() => ({ auth: { status: "authenticated", roles: [] as string[] } }));
vi.mock("../use-auth", () => ({ useAuth: () => auth }));
afterEach(cleanup);

it.each([{ roles: ["ADMINISTRADOR"], allowed: true }, { roles: ["ESTADISTICA", "FACTURACION"], allowed: false }, { roles: [], allowed: false }])("RequireRole autoriza por rol exacto: $roles", async ({ roles, allowed }) => {
  auth.roles = roles;
  const router = createMemoryRouter([
    { path: "/", element: <h1>Inicio</h1> },
    { element: <RequireRole role="ADMINISTRADOR" />, children: [{ path: "/admin", element: <h1>Administración</h1> }] },
  ], { initialEntries: ["/admin"] });
  render(<RouterProvider router={router} />);
  expect(await screen.findByRole("heading", { name: allowed ? "Administración" : "Inicio" })).toBeVisible();
  expect(router.state.location.pathname).toBe(allowed ? "/admin" : "/");
  if (!allowed) expect(router.state.historyAction).toBe("REPLACE");
});
