// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { AuthState } from "@/features/auth/types";
import { SessionExpiryDialog } from "./session-expiry-dialog";

afterEach(cleanup);
function setup(status: AuthState["status"] = "authenticated", open = true) {
  const auth: AuthState = { status, user: null, roles: [], permissions: [] };
  const warning = { open, deadlineAt: Date.now() + 60_000 };
  const session = {
    subscribe: () => () => undefined, getSnapshot: () => auth,
    subscribeWarning: () => () => undefined, getWarningSnapshot: () => warning,
    refresh: vi.fn().mockResolvedValue(undefined), logout: vi.fn().mockResolvedValue(undefined),
  };
  render(<><button>Detrás del aviso</button><SessionExpiryDialog session={session} /></>);
  return session;
}
it.each(["loading", "anonymous"] as const)("no muestra aviso para estado %s", (status) => {
  setup(status); expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
it("autenticado sin warning abierto no muestra diálogo", () => {
  setup("authenticated", false); expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
it("enfoca Continuar, atrapa Tab y Escape no elige ni cierra", async () => {
  const user = userEvent.setup(); const session = setup();
  const continueButton = screen.getByRole("button", { name: "Continuar sesión" });
  const logoutButton = screen.getByRole("button", { name: "Cerrar sesión" });
  await waitFor(() => expect(continueButton).toHaveFocus());
  await user.tab(); await waitFor(() => expect(logoutButton).toHaveFocus());
  await user.tab(); await waitFor(() => expect(continueButton).toHaveFocus());
  await user.keyboard("{Escape}");
  expect(screen.getByRole("alertdialog")).toBeVisible(); expect(session.refresh).not.toHaveBeenCalled(); expect(session.logout).not.toHaveBeenCalled();
  expect(logoutButton).toHaveClass("border");
});
