import { expect } from "vitest";
import { screen, within } from "@testing-library/react";

/** One structural contract exercised against each real administration page. */
export function expectAdminPage(title: string, tableTitle: string, description: string, columns: string[], createLabel: string) {
  const heading = screen.getByRole("heading", { level: 1, name: title });
  expect(heading.className).toBe("text-title-lg font-semibold text-gray-800 dark:text-white/90");
  const header = heading.closest("header")!;
  expect(header.className).toBe("flex items-start gap-4");
  expect(header.parentElement?.className).toBe("space-y-6");
  expect(within(header).getByText(description)).toHaveClass("mt-1", "text-sm", "text-gray-500", "dark:text-gray-400");
  const icon = header.querySelector('[aria-hidden="true"]')!;
  expect(icon).toHaveClass("size-12", "shrink-0", "rounded-xl");
  expect(icon.querySelector("svg")).toBeInTheDocument();
  const tableHeading = screen.getByRole("heading", { level: 2, name: tableTitle });
  expect(tableHeading.className).toBe("text-lg font-semibold text-gray-800 dark:text-white/90");
  const card = tableHeading.closest("section")!;
  expect(card.parentElement).toBe(header.parentElement);
  expect(card).toHaveClass("overflow-hidden", "rounded-2xl", "border", "bg-white", "dark:border-gray-800");
  const cardHeader = card.firstElementChild as HTMLElement;
  const titleGroup = tableHeading.parentElement!.parentElement!;
  expect(titleGroup.textContent).toBe(tableTitle);
  expect(titleGroup.querySelectorAll("svg, p, [aria-hidden='true']")).toHaveLength(0);
  expect(cardHeader.querySelector("p")).toBeNull();
  expect(screen.getAllByText(description)).toHaveLength(1);
  expect(within(cardHeader).getByRole("searchbox", { name: `Buscar en ${tableTitle}` })).toBeVisible();
  expect(within(card).getByRole("button", { name: "Página anterior" })).toBeInTheDocument();
  expect(within(card).getByRole("button", { name: "Página siguiente" })).toBeInTheDocument();
  expect(within(screen.getByRole("table", { name: tableTitle })).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(columns);
  expect(within(screen.getByRole("combobox", { name: "Registros por página" })).getAllByRole("option").map(option => option.textContent)).toEqual(["10", "25", "50", "100"]);
  expect(screen.getByRole("button", { name: createLabel }).querySelector("svg")).toHaveAttribute("aria-hidden", "true");
}
