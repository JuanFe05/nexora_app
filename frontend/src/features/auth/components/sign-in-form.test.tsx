// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "@/contexts/theme-context";
import AuthLayout from "@/pages/others/auth/layout";
import { ApiError } from "@/lib/http/api-error";
import SignInPage from "@/pages/others/auth/sign-in";
import SignInForm from "./sign-in-form";

const { login } = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock("../use-auth", () => ({ useAuth: () => ({ login }) }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => { login.mockReset(); });

const identifier = () => screen.getByLabelText(/Usuario o correo electrónico/);
const password = () => screen.getByLabelText(/^Contraseña/);

describe("formulario de acceso", () => {
  it("valida debajo de cada campo, enfoca el primero y limpia al editar sin llamar login", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(login).not.toHaveBeenCalled();
    expect(identifier()).toHaveFocus();
    for (const [field, message] of [[identifier(), "Introduce tu usuario o correo electrónico."], [password(), "Introduce tu contraseña."]] as const) {
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription(message);
      expect(field.closest('[data-slot="field"]')).toContainElement(screen.getByText(message));
    }
    await user.type(identifier(), "usuario");
    expect(identifier()).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Introduce tu usuario o correo electrónico.")).not.toBeInTheDocument();
    await user.type(password(), "secreto");
    expect(password()).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Introduce tu contraseña.")).not.toBeInTheDocument();
  });

  it("envía el identificador recortado y conserva la contraseña", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.type(identifier(), " usuario@example.com ");
    await user.type(password(), " secreto ");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(login).toHaveBeenCalledExactlyOnceWith({ identificador: "usuario@example.com", contrasena: " secreto " });
  });

  it("preserva bloqueo mientras espera y limpia la contraseña tras un error sin revelar el campo", async () => {
    let rejectLogin!: (failure: unknown) => void;
    login.mockImplementation(() => new Promise((_resolve, reject) => { rejectLogin = reject; }));
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.type(identifier(), "usuario");
    await user.type(password(), "secreto");
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(identifier()).toBeDisabled();
    expect(password()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Iniciando sesión…" })).toBeDisabled();
    rejectLogin(new ApiError(401, "Unauthorized", null));
    expect(await screen.findByRole("alert")).toHaveTextContent("Credenciales invalidas");
    expect(identifier()).toHaveAttribute("aria-invalid", "true");
    expect(password()).toHaveAttribute("aria-invalid", "true");
    expect(password()).toHaveValue("");
    expect(identifier()).toHaveValue("usuario");
    expect(identifier()).not.toBeDisabled();
  });

  it("muestra y oculta contraseña con estado accesible", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    expect(password()).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Mostrar contraseña" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(password()).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar contraseña" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(password()).toHaveAttribute("type", "password");
  });

  it("mantiene dimensiones estándar dentro de la columna max-w-md", () => {
    render(<HelmetProvider><MemoryRouter><SignInPage /></MemoryRouter></HelmetProvider>);
    expect(identifier().closest(".max-w-md")).toBeInTheDocument();
    expect(password().closest(".max-w-md")).toBeInTheDocument();
    expect(identifier()).toHaveClass("h-11", "rounded-[10px]");
    expect(password().closest('[data-slot="input-group"]')).toHaveClass("h-11", "rounded-[10px]");
    for (const field of [identifier(), password(), password().closest('[data-slot="input-group"]')]) {
      expect(field).not.toHaveClass("h-[68px]", "rounded-2xl");
    }
  });

  it.each([2026, 2031])("muestra el pie debajo del formulario con el año dinámico %s", (year) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${year}-07-01T12:00:00Z`));
    render(<HelmetProvider><MemoryRouter><SignInPage /></MemoryRouter></HelmetProvider>);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(`NEXORA © ${year}. Todos los derechos reservados. El uso de este sistema de software está sujeto a los términos de licencia`);
    expect(footer).toHaveClass("text-xs", "text-gray-500", "dark:text-gray-400", "pb-24", "lg:pb-6");
    expect(screen.getByRole("button", { name: "Iniciar sesión" }).compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(footer).not.toHaveClass("fixed", "absolute");
  });

  it("presenta fotografía decorativa, marca y slogan también en móvil, sin enlace de regreso", () => {
    render(<HelmetProvider><MemoryRouter><ThemeProvider><Routes>
      <Route element={<AuthLayout />}><Route index element={<SignInPage />} /></Route>
    </Routes></ThemeProvider></MemoryRouter></HelmetProvider>);
    const slogan = "Transformamos datos en decisiones inteligentes";
    expect(screen.getAllByText("NEXORA")).toHaveLength(2);
    expect(screen.getAllByText(slogan)).toHaveLength(2);
    expect(screen.getAllByText(slogan)[0].closest(".lg\\:hidden")).toBeInTheDocument();
    const image = document.querySelector('img[src="/images/auth/sign-in-bg.jpg"]');
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");
    expect(image).toHaveAttribute("width", "1600");
    expect(image).toHaveAttribute("height", "1067");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image?.parentElement).toHaveClass("hidden", "lg:grid");
    expect(screen.queryByText(/Volver a la página de inicio/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Volver/ })).not.toBeInTheDocument();
  });
});
