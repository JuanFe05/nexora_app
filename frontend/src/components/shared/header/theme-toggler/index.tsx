import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme-context";
import { MoonIcon, SunIcon } from "@/icons";

export default function ThemeToggleButton() {
  const { toggleTheme, theme } = useTheme();
  return (
    <Button variant="outline" size="icon-lg" className="relative"
      aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
      onClick={toggleTheme}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
