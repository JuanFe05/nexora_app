import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme-context";
import { MoonIcon, SunIcon } from "@/icons";

export default function ThemeToggleButton() {
  const { toggleTheme, theme } = useTheme();
  return (
    <Button size="icon-lg" className="relative rounded-full bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-400 focus-visible:ring-offset-2 dark:bg-gray-800 dark:text-white dark:ring-1 dark:ring-gray-600 dark:hover:bg-gray-700 dark:focus-visible:ring-3 dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-gray-900"
      aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
      aria-pressed={theme === "dark"}
      onClick={toggleTheme}>
      {theme === "dark" ? <SunIcon aria-hidden="true" data-theme-icon="sun" /> : <MoonIcon aria-hidden="true" data-theme-icon="moon" />}
    </Button>
  );
}
