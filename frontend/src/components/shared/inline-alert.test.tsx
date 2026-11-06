// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InlineAlert } from "./inline-alert";

afterEach(cleanup);

describe("InlineAlert", () => {
  it("anuncia los errores como alert y el resto como status", () => {
    render(<><InlineAlert variant="error">falló</InlineAlert><InlineAlert variant="success">listo</InlineAlert></>);
    expect(screen.getByRole("alert")).toHaveTextContent("falló");
    expect(screen.getByRole("status")).toHaveTextContent("listo");
  });
});
