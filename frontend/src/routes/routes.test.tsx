// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { Suspense } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routes } from "./index";

const { auth } = vi.hoisted(() => ({ auth: { status: "authenticated" } }));
vi.mock("@/features/auth/use-auth", () => ({ useAuth: () => auth }));
vi.mock("@/components/layout/app-layout", () => ({ default: () => <Outlet /> }));
vi.mock("@/pages/others/auth/layout", () => ({ default: () => <Outlet /> }));
afterEach(cleanup);

function mount(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<HelmetProvider><Suspense fallback="Cargando"><RouterProvider router={router} /></Suspense></HelmetProvider>);
  return router;
}

describe("páginas protegidas", () => {
  it("conserva Inicio y su marcador", async () => {
    auth.status = "authenticated";
    mount("/");
    expect(await screen.findByRole("heading", { name: "Inicio" })).toBeVisible();
    expect(screen.getByText("Página en blanco")).toBeVisible();
  });
  it("registra /cuenta con el mismo marcador y título propio", async () => {
    auth.status = "authenticated";
    mount("/cuenta");
    expect(await screen.findByRole("heading", { name: "Configuración de la cuenta" })).toBeVisible();
    expect(screen.getByText("Página en blanco")).toBeVisible();
  });
  it("protege /cuenta y conserva el destino al enviar al acceso", async () => {
    auth.status = "anonymous";
    const router = mount("/cuenta");
    expect(await screen.findByRole("button", { name: "Iniciar sesión" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/signin");
    expect(router.state.location.state).toMatchObject({ from: "/cuenta" });
  });
});
