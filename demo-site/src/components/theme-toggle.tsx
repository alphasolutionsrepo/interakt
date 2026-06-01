"use client"

import * as React from "react"
import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "next-themes"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-9 w-[108px] rounded-lg bg-muted/50" />
  }

  const options = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ] as const

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          type="button"
          key={value}
          onClick={() => setTheme(value)}
          className={`
            inline-flex items-center justify-center rounded-md p-1.5 text-sm transition-all
            ${theme === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
            }
          `}
          title={label}
        >
          <Icon className="w-4 h-4" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  )
}
