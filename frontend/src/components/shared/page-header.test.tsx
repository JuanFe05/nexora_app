// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UsersIcon } from "@/icons";
import { PageHeader } from "./page-header";

afterEach(cleanup);

describe("PageHeader", () => {
  it("renders the existing h1 classes, description and decorative brand tile", () => {
    render(<PageHeader icon={<UsersIcon />} title="Administración de usuarios" description="Administra los usuarios." />);
    const title = screen.getByRole("heading", { level: 1, name: "Administración de usuarios" });
    expect(title).toHaveClass("text-title-lg", "font-semibold", "text-gray-800", "dark:text-white/90");
    expect(screen.getByText("Administra los usuarios.")).toHaveClass("text-sm", "text-gray-500", "dark:text-gray-400");
    const tile = title.closest("header")?.querySelector('[aria-hidden="true"]');
    expect(tile).toHaveClass("size-12", "shrink-0", "rounded-xl", "bg-brand-50", "text-brand-500", "dark:bg-brand-500/15", "dark:text-brand-400");
    expect(tile?.querySelector("svg")).toBeInTheDocument();
    expect(title.parentElement).toHaveClass("min-w-0");
  });

  it("accepts an icon component and omits an absent description", () => {
    render(<PageHeader icon={UsersIcon} title="Usuarios" />);
    const header = screen.getByRole("heading", { level: 1, name: "Usuarios" }).closest("header");
    expect(header?.querySelector('[aria-hidden="true"] svg')).toBeInTheDocument();
    expect(header?.querySelector("p")).toBeNull();
  });
});
