// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { Accordion, AccordionItem, AccordionHeader, AccordionTrigger, AccordionPanel } from "./accordion";

afterEach(cleanup);
it("supports controlled multiple panels, keyboard activation and TailAdmin states", async () => {
  function Harness() {
    const [value, setValue] = useState<string[]>([]);
    return <Accordion value={value} onValueChange={setValue} multiple>
      {["Uno", "Dos"].map(name => <AccordionItem key={name} value={name}>
        <AccordionHeader><AccordionTrigger>{name}</AccordionTrigger></AccordionHeader>
        <AccordionPanel>Contenido {name}</AccordionPanel>
      </AccordionItem>)}
    </Accordion>;
  }
  render(<Harness />);
  const first = screen.getByRole("button", { name: "Uno" });
  expect(first).toHaveAttribute("aria-expanded", "false");
  expect(first).toHaveClass("focus-visible:ring-3");
  expect(first.closest('[data-slot="accordion-item"]')).toHaveClass("rounded-xl", "dark:border-gray-800");
  first.focus();
  await userEvent.keyboard("{Enter}");
  expect(first).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Contenido Uno")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Dos" }));
  expect(screen.getByText("Contenido Uno")).toBeVisible();
  expect(screen.getByText("Contenido Dos")).toBeVisible();
  expect(first.querySelector("svg")).toHaveClass("group-data-panel-open:rotate-180");
  await userEvent.click(first);
  expect(first).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Contenido Uno")).not.toBeInTheDocument();
  expect(screen.getByText("Contenido Dos")).toBeVisible();
});
