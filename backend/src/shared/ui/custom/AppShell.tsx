'use client'

import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/shared/ui/custom/appSidebar"
import { Navbar } from "@/shared/ui/custom/navbar"
import { HelpButton } from "@/shared/ui/custom/HelpButton"

// Public routes that should NOT show the sidebar
const PUBLIC_ROUTES = ['/', '/login', '/register']

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()

  // Check if current route is a public route (no sidebar needed)
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)

  // Show public layout without sidebar for public routes
  if (isPublicRoute) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="flex items-center justify-center size-8 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700">
                <Image
                  src="/logo/interakt_logo_highres.png"
                  alt="Interakt"
                  width={20}
                  height={20}
                  className="object-contain brightness-0 invert"
                />
              </div>
              <span className="font-bold text-lg tracking-tight">Interakt</span>
            </a>
            <Navbar />
          </div>
        </header>
        <main className="flex-1 bg-background font-sans">
          {children}
        </main>
      </div>
    )
  }

  // Show authenticated layout with sidebar for all other routes
  // Middleware handles redirecting unauthenticated users to login
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar variant="inset" />
        <div className="flex-1 flex flex-col relative">
          <header className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border shadow-sm">
            <div className="flex items-center justify-between px-4 py-3">
              <SidebarTrigger />
              <div className="flex items-center gap-1">
                <HelpButton />
                <Navbar />
              </div>
            </div>
          </header>
          <main className="flex-1 bg-background font-sans overflow-auto">
            <div id="mainDiv" className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
