// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { UserRoleChecklist } from "./user-role-checklist";

afterEach(cleanup);
const props = { catalog: [{ id: "admin", codigo: "ADMIN", nombre: "ADMINISTRADOR" }], selected: ["LEGACY"], onChange: vi.fn(), loading: false, error: null, onRetry: vi.fn() };
it("retains code selection, checkbox keyboard semantics and the outside-catalog notice", async () => {
  const onChange = vi.fn();
  const { rerender } = render(<UserRoleChecklist {...props} onChange={onChange} />);
  const role = screen.getByRole("checkbox", { name: "ADMINISTRADOR" });
  expect(screen.getByText("Roles fuera del catálogo actual (se conservarán): LEGACY.")).toBeVisible();
  role.focus(); await userEvent.keyboard("[Space]");
  expect(onChange).toHaveBeenLastCalledWith(["LEGACY", "ADMIN"]);
  rerender(<UserRoleChecklist {...props} selected={["LEGACY", "ADMIN"]} onChange={onChange} />);
  expect(role).toBeChecked();
  expect(role.closest("label")).toHaveClass("border-brand-500", "bg-brand-50", "dark:bg-brand-500/10");
  await userEvent.click(role);
  expect(onChange).toHaveBeenLastCalledWith(["LEGACY"]);
});
it("preserves loading, safe error/retry and empty states", async () => {
  const onRetry = vi.fn();
  const { rerender } = render(<UserRoleChecklist {...props} loading />);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando roles…");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  rerender(<UserRoleChecklist {...props} error="No tienes permisos para consultar roles." onRetry={onRetry} />);
  expect(screen.getByRole("alert")).toHaveTextContent("No tienes permisos para consultar roles.");
  await userEvent.click(screen.getByRole("button", { name: "Reintentar roles" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  rerender(<UserRoleChecklist {...props} catalog={[]} selected={[]} />);
  expect(screen.getByText("No hay roles disponibles.")).toBeVisible();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
it("preserves the permission notice instead of offering unauthorized selection", () => {
  render(<UserRoleChecklist {...props} disabled />);
  expect(screen.getByRole("group", { name: "Roles" })).toBeDisabled();
  expect(screen.getByText("Necesitas el permiso identity.roles.view para consultar el catálogo y asignar roles.")).toBeVisible();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
