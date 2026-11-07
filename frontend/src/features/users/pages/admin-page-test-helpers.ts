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
  expect(tableHeading.nextElementSibling).toHaveClass("mt-1", "text-sm");
  const cardIcon = tableHeading.parentElement!.parentElement!.querySelector('[aria-hidden="true"]')!;
  expect(cardIcon).toHaveClass("size-9", "shrink-0", "rounded-lg");
  expect(cardIcon.querySelector("svg")).toBeInTheDocument();
  expect(cardIcon.querySelector("svg")?.innerHTML).toBe(icon.querySelector("svg")?.innerHTML);
  expect(within(screen.getByRole("table", { name: tableTitle })).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(columns);
  expect(within(screen.getByRole("combobox", { name: "Registros por página" })).getAllByRole("option").map(option => option.textContent)).toEqual(["10", "25", "50", "100"]);
  expect(screen.getByRole("button", { name: createLabel }).querySelector("svg")).toHaveAttribute("aria-hidden", "true");
}
