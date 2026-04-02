import { useEffect } from "react";

const applyTheme = () => {
  const hour = new Date().getHours();
  const isDark = hour >= 18 || hour < 6;
  document.documentElement.classList.toggle("dark", isDark);
};

export const useTimeBasedTheme = () => {
  useEffect(() => {
    applyTheme();
    // Re-check every minute
    const interval = setInterval(applyTheme, 60_000);
    return () => clearInterval(interval);
  }, []);
};
