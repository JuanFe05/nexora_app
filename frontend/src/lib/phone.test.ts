import { expect, it } from "vitest";
import { phoneIsValid } from "./phone";

it.each(["3001234567", "0301234567"])("acepta %s", (v) => expect(phoneIsValid(v)).toBe(true));
it.each(["+573001234567", "300-1234567", "300 1234567", "123", "30012345ab", "٣٠٠١٢٣٤٥٦٧", "3001234567\n"])("rechaza %s", (v) => expect(phoneIsValid(v)).toBe(false));
