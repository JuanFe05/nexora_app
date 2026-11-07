import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme-context";
import { MoonIcon, SunIcon } from "@/icons";

export default function ThemeToggleButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const { toggleTheme, theme } = useTheme();
  return (
    <Button variant={variant} size="icon-lg" className="relative"
      aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
      aria-pressed={theme === "dark"}
      onClick={toggleTheme}>
      {theme === "dark" ? <SunIcon aria-hidden="true" className="size-5" data-theme-icon="sun" /> : <MoonIcon aria-hidden="true" className="size-5" data-theme-icon="moon" />}
    </Button>
  );
}
