import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

type AdditionalClassGroupIds = "menu-item-state" | "menu-item-icon-state";

const customTwMerge = extendTailwindMerge<AdditionalClassGroupIds>({
  extend: {
    classGroups: {
      "font-size": [
        "text-heading-one", "text-heading-two", "text-heading-three",
        "text-heading-four", "text-heading-five", "text-heading-six",
        "text-title-sm", "text-title-lg",
      ],
      shadow: [
        "shadow-theme-xs", "shadow-theme-sm", "shadow-theme-md",
        "shadow-theme-lg", "shadow-theme-xl", "shadow-focus-ring", "shadow-tooltip",
      ],
      "menu-item-state": ["menu-item-active", "menu-item-inactive"],
      "menu-item-icon-state": ["menu-item-icon-active", "menu-item-icon-inactive"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(...inputs));
}
