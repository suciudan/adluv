export type AppTheme = "dark" | "light";

export const defaultAppTheme: AppTheme = "light";
export const appThemeStorageKey = "adluv-theme";

export function normalizeAppTheme(value: string | null | undefined): AppTheme {
  return value === "dark" ? "dark" : defaultAppTheme;
}

export const appThemeInitScript = `(() => {
  const root = document.documentElement;
  const storageKey = "${appThemeStorageKey}";
  const getSystemTheme = () => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const applyTheme = () => {
    const storedTheme = window.localStorage.getItem(storageKey);
    root.dataset.theme = storedTheme === "dark" || storedTheme === "light" ? storedTheme : getSystemTheme();
  };

  try {
    applyTheme();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      const storedTheme = window.localStorage.getItem(storageKey);
      if (storedTheme !== "dark" && storedTheme !== "light") {
        applyTheme();
      }
    });
  } catch {
    root.dataset.theme = "${defaultAppTheme}";
  }
})();`;
