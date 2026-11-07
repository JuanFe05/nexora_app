// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "./toast-provider";
import { useToast } from "./use-toast";

function Trigger({ variant, duration }: { variant: "success" | "error" | "warning" | "info"; duration?: number }) {
  const toast = useToast();
  return <button onClick={() => toast[variant](`mensaje ${variant}`, duration === undefined ? undefined : { duration })}>{variant}</button>;
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("toasts", () => {
  it.each(["success", "error", "warning", "info"] as const)("muestra el aviso %s flotante con el rol accesible correcto", async (variant) => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ToastProvider><Trigger variant={variant} /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: variant }));
    const toast = screen.getByText(`mensaje ${variant}`).closest("[data-toast]");
    expect(toast).toHaveAttribute("data-variant", variant);
    expect(toast).toHaveAttribute("role", variant === "error" || variant === "warning" ? "alert" : "status");
    expect(screen.getByRole("region", { name: "Notificaciones" })).toHaveClass("fixed");
  });

  it("desaparece sola tras la duración configurada del proveedor y respeta la de cada aviso", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    function Both() {
      const toast = useToast();
      return <button onClick={() => { toast.success("mensaje success"); toast.info("mensaje info", { duration: 1000 }); }}>ambos</button>;
    }
    render(<ToastProvider duration={3000}><Both /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: "ambos" }));
    act(() => { vi.advanceTimersByTime(900); });
    expect(screen.getByText("mensaje info")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText("mensaje info")).not.toBeInTheDocument();
    expect(screen.getByText("mensaje success")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.queryByText("mensaje success")).not.toBeInTheDocument();
  });

  it("permite cerrarlo manualmente y una duración 0 lo mantiene hasta cerrarlo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ToastProvider><Trigger variant="error" duration={0} /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: "error" }));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByText("mensaje error")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cerrar notificación" }));
    expect(screen.queryByText("mensaje error")).not.toBeInTheDocument();
  });

  it("no corre el temporizador mientras el puntero está sobre el aviso", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ToastProvider duration={2000}><Trigger variant="success" /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: "success" }));
    await user.hover(screen.getByText("mensaje success"));
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText("mensaje success")).toBeInTheDocument();
    await user.unhover(screen.getByText("mensaje success"));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.queryByText("mensaje success")).not.toBeInTheDocument();
  });
});
