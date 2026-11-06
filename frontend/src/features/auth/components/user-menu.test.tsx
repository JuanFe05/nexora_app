// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserMenu } from "./user-menu";

const { logout, auth } = vi.hoisted(() => ({
  logout: vi.fn(),
  auth: { user: { id: "1", nombre_usuario: "ana", nombre_completo: "Ana García López", correo: "ana@example.com" } as { id: string; nombre_usuario: string; nombre_completo: string; correo: string } | null },
}));
vi.mock("../use-auth", () => ({ useAuth: () => ({ ...auth, logout }) }));
afterEach(cleanup);
beforeEach(() => { logout.mockReset(); });

function mount() {
  return render(<MemoryRouter><Routes>
    <Route path="/" element={<><UserMenu /><button type="button">Fuera</button></>} />
    <Route path="/configuracion/perfil" element={<h1>Destino perfil</h1>} />
  </Routes></MemoryRouter>);
}

describe("menú de usuario", () => {
  it("abre, muestra identidad y únicamente cuenta/logout; cerrar sesión llama logout", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    const trigger = screen.getByRole("button", { name: /Menú de usuario: ana/ });
    expect(container.querySelector('[data-slot="avatar"], [data-slot="avatar-fallback"], img')).toBeNull();
    expect(screen.queryByText("AG")).not.toBeInTheDocument();
    expect(trigger.querySelector("svg.sm\\:hidden")).toHaveAttribute("aria-hidden", "true");
    expect(trigger.querySelector("svg[data-menu-chevron]")).toHaveClass("group-data-popup-open:rotate-180");
    await user.click(trigger);
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByText("ana")).toHaveLength(2);
    expect(screen.queryByText("Ana García López")).not.toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Configuración de la cuenta" })).toHaveAttribute("href", "/configuracion/perfil");
    const signOut = screen.getByRole("menuitem", { name: "Cerrar sesión" });
    expect(signOut).toHaveClass("text-red-600", "dark:text-red-400", "hover:bg-red-50", "dark:hover:bg-red-500/10", "data-highlighted:text-red-600", "dark:data-highlighted:text-red-400");
    expect(signOut.querySelector("svg")).toHaveClass("text-red-600", "dark:text-red-400");
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(item.querySelector("svg")).toHaveClass("size-6");
    }
    expect(screen.getByRole("menu").querySelector('[data-slot="avatar"], [data-slot="avatar-fallback"], img')).toBeNull();
    expect(screen.queryByText(/perfil|soporte|idioma/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
    expect(logout).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("Escape devuelve el foco y click exterior cierra", async () => {
    const user = userEvent.setup();
    mount();
    const trigger = screen.getByRole("button", { name: /Menú de usuario: ana/ });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Fuera" }));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("navega con flechas y abre el perfil mediante el item", async () => {
    const user = userEvent.setup();
    mount();
    screen.getByRole("button", { name: /Menú de usuario: ana/ }).focus();
    await user.keyboard("{ArrowDown}");
    const account = await screen.findByRole("menuitem", { name: "Configuración de la cuenta" });
    await waitFor(() => expect(account).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Cerrar sesión" })).toHaveFocus();
    await user.keyboard("{ArrowUp}{Enter}");
    expect(await screen.findByRole("heading", { name: "Destino perfil" })).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it("no muestra menú sin usuario", () => {
    const previousUser = auth.user;
    auth.user = null;
    try {
      mount();
      expect(screen.queryByRole("button", { name: /Menú de usuario/ })).not.toBeInTheDocument();
    } finally { auth.user = previousUser; }
  });
});
