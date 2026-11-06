import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type ThemeMode = "light" | "dark" | "auto";
type ResolvedTheme = "light" | "dark";
type ThemeContextType = {
  theme: ResolvedTheme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const [theme, setTheme] = useState<ResolvedTheme>("light");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const savedMode = localStorage.getItem("theme-mode") as ThemeMode | null;
    const legacySavedTheme = localStorage.getItem("theme") as ResolvedTheme | null;
    const initialMode = savedMode || (legacySavedTheme as ThemeMode) || "light";
    setThemeModeState(initialMode);
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    localStorage.setItem("theme-mode", themeMode);
    if (themeMode === "auto") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => setTheme(mediaQuery.matches ? "dark" : "light");
      handleChange();
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else {
      setTheme(themeMode as ResolvedTheme);
    }
  }, [themeMode, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem("theme", theme);
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
        document.documentElement.setAttribute("data-color-scheme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.setAttribute("data-color-scheme", "light");
      }
    }
  }, [theme, isInitialized]);

  const setThemeMode = (mode: ThemeMode) => setThemeModeState(mode);
  const toggleTheme = () => setThemeModeState(() => theme === "light" ? "dark" : "light");

  return (
    <ThemeContext.Provider value={{ theme, themeMode, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error("useTheme debe usarse dentro de ThemeProvider");
  return context;
};
