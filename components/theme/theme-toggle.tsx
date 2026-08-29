"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme";
import { useHotkeys } from "react-hotkeys-hook";
import { Sun, Moon } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const cycle = () => {
    const active = mounted ? theme : "light";
    setTheme(active === "dark" ? "light" : "dark");
  };

  useHotkeys("mod+shift+l", cycle, { preventDefault: true }, [theme, mounted]);

  // Evita mismatch de hidratação SSR vs Client (localStorage)
  const currentTheme = mounted ? theme : "light";
  const Icon = currentTheme === "dark" ? Moon : Sun;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={`Tema: ${currentTheme}. Cmd+Shift+L para alternar.`}
    >
      <Icon size={16} aria-hidden />
    </Button>
  );
}
