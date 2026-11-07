// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { Tabs, TabsList, TabsTrigger, TabsPanel } from "./tabs";
afterEach(cleanup);
it("supports keyboard navigation, active styling and preserves panel state", async () => {
  const user = userEvent.setup();
  render(<Tabs defaultValue="one"><TabsList aria-label="Sections"><TabsTrigger value="one">One</TabsTrigger><TabsTrigger value="two">Two</TabsTrigger></TabsList><TabsPanel value="one" keepMounted><input aria-label="Draft" /></TabsPanel><TabsPanel value="two">Second</TabsPanel></Tabs>);
  await user.type(screen.getByLabelText("Draft"), "saved draft");
  screen.getByRole("tab", { name: "One" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "Two" })).toHaveFocus();
  expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Second");
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByLabelText("Draft")).toHaveValue("saved draft");
  expect(screen.getByRole("tab", { name: "One" })).toHaveClass("focus-visible:ring-3", "data-[active]:text-brand-600", "dark:data-[active]:text-brand-400");
  expect(screen.getByRole("tablist")).toHaveClass("overflow-x-auto");
});
