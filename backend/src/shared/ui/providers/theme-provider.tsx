// src/shared/ui/providers/theme-provider.tsx

"use client";

/**
 * Theme Provider
 * Wraps the app to enable theme switching (light/dark mode)
 * Uses next-themes for theme management
 */

import * as React from "react";
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}