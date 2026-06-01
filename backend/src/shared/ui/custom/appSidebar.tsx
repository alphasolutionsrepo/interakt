'use client'
import React, { useState, useEffect } from "react"
import {
  ChevronRight
} from "lucide-react"
import { usePathname } from "next/navigation"
import Image from "next/image"
import { useTranslation } from 'react-i18next'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
  useSidebar
} from "../components/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { sidebarGroups } from "@/shared/data/SideBar-Items"

/**
 * Check if a sidebar item should be considered active.
 *
 * Strategy:
 * 1. First check if ANY sibling is an exact match - if so, only that sibling should be active
 * 2. Then check for prefix matches, preferring the most specific match
 */
function isUrlActive(pathname: string, itemUrl: string, allSubItemUrls?: string[]): boolean {
  // Exact match is always active
  if (pathname === itemUrl) return true

  // Don't match root path as prefix
  if (itemUrl === "/") return false

  // If we have sibling URLs, check if another sibling is a better match
  if (allSubItemUrls && allSubItemUrls.length > 0) {
    // Check if any sibling (including self) is an exact match
    const exactMatchSibling = allSubItemUrls.find(url => pathname === url)
    if (exactMatchSibling) {
      // There's an exact match - only that item should be active
      return exactMatchSibling === itemUrl
    }

    // No exact match - find the best prefix match among siblings
    // The best match is the longest/most specific URL that matches as a prefix
    const matchingSiblings = allSubItemUrls.filter(url =>
      url !== "/" && pathname.startsWith(url + "/")
    )

    if (matchingSiblings.length > 0) {
      // Sort by length descending to get the most specific match first
      const bestMatch = matchingSiblings.sort((a, b) => b.length - a.length)[0]
      return bestMatch === itemUrl
    }
  }

  // Fallback: simple prefix match (for items without siblings)
  return pathname.startsWith(itemUrl + "/")
}

/**
 * Check if a parent item with sub-items should be considered active
 */
function isParentActive(pathname: string, subItems: Array<{ url: string }>): boolean {
  return subItems.some(subItem =>
    pathname === subItem.url || pathname.startsWith(subItem.url + "/")
  )
}

// Helper function to compute open states based on pathname
function computeOpenStates(currentPath: string) {
  const groups = new Set<string>()
  const items = new Set<string>()

  sidebarGroups.forEach((group) => {
    const isMainGroup = group.name === "sidebar.groups.main"
    const hasActiveItem = group.items.some(item => {
      if (item.subItems) {
        const isActive = item.subItems.some(subItem =>
          currentPath === subItem.url || currentPath.startsWith(subItem.url + "/")
        )
        if (isActive) {
          items.add(item.title)
        }
        return isActive
      }
      return currentPath === item.url || currentPath.startsWith(item.url + "/")
    })

    if (isMainGroup || hasActiveItem) {
      groups.add(group.name)
    }
  })

  return { groups, items }
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { t } = useTranslation()
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  // Track which items are open - initialize with current pathname
  const [openItems, setOpenItems] = useState<Set<string>>(() => computeOpenStates(pathname).items)

  // Update open states when pathname changes
  useEffect(() => {
    const { items: newOpenItems } = computeOpenStates(pathname)

    setOpenItems(prev => {
      // Merge: keep previously open items, add newly active ones
      const merged = new Set(prev)
      newOpenItems.forEach(i => merged.add(i))
      return merged
    })
  }, [pathname])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="px-2 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="group" tooltip="Interakt">
              <a href="/dashboard" className="flex items-center justify-center gap-3 p-3 hover:bg-sidebar-accent rounded-2xl transition-all duration-200 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center">
                <Image
                  src="/logo/interakt_logo_highres.png"
                  alt="Interakt"
                  width={96}
                  height={96}
                  className="object-contain group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:h-10 dark:hidden"
                />
                <Image
                  src="/logo/interakt_logo_highres_dark.png"
                  alt="Interakt"
                  width={96}
                  height={96}
                  className="object-contain group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:h-10 hidden dark:block"
                />
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {sidebarGroups.map((group) => (
            <SidebarGroup key={group.name} className="py-1">
              {/* Group label - hidden when collapsed to icon */}
              <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden flex items-center text-[11px] font-bold text-sidebar-foreground/70 uppercase tracking-wider px-3 py-1.5">
                <span>{t(group.name)}</span>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-0.5 pl-2">
                      {group.items.map((item) => {
                        // Collect all sibling URLs for smart active detection
                        const allItemUrls = group.items.map(i => i.url)
                        const isActive = isUrlActive(pathname, item.url, allItemUrls)

                        if (item.subItems && item.subItems.length > 0) {
                          // Collect all sub-item URLs for smart active detection
                          const allSubItemUrls = item.subItems.map(si => si.url)
                          // Check if parent should show as active (any child page is active)
                          const parentIsActive = isParentActive(pathname, item.subItems)

                          // Find the listing page URL (usually the one without /create)
                          const listingUrl = item.subItems.find(si => !si.url.includes('/create'))?.url || item.subItems[0].url

                          // Item with sub-items - different behavior based on collapsed state
                          if (isCollapsed) {
                            // When collapsed, clicking should navigate to listing page
                            return (
                              <SidebarMenuItem key={item.title}>
                                <SidebarMenuButton
                                  asChild
                                  tooltip={t(item.title)}
                                  isActive={parentIsActive}
                                  className="hover:bg-sidebar-accent rounded-xl transition-all duration-200 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                                >
                                  <a href={listingUrl} className="flex items-center gap-2">
                                    {item.icon && (
                                      <item.icon className="size-4 ml-1" />
                                    )}
                                    <span className="font-semibold text-sm">{t(item.title)}</span>
                                  </a>
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            )
                          }

                          // When expanded, show collapsible with sub-items
                          return (
                            <Collapsible
                              key={item.title}
                              asChild
                              open={openItems.has(item.title)}
                              onOpenChange={(open) => {
                                setOpenItems(prev => {
                                  const next = new Set(prev)
                                  if (open) {
                                    next.add(item.title)
                                  } else {
                                    next.delete(item.title)
                                  }
                                  return next
                                })
                              }}
                              className="group/collapsible"
                            >
                              <SidebarMenuItem>
                                <CollapsibleTrigger asChild>
                                  <SidebarMenuButton
                                    tooltip={t(item.title)}
                                    isActive={parentIsActive}
                                    className="group hover:bg-sidebar-accent rounded-xl transition-all duration-200 data-[state=open]:bg-sidebar-accent/50 data-[active=true]:bg-primary/10 data-[active=true]:text-primary gap-2"
                                  >
                                    {item.icon && (
                                      <item.icon className="size-4 ml-1" />
                                    )}
                                    <span className="font-semibold text-sm">{t(item.title)}</span>
                                    <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                  </SidebarMenuButton>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <SidebarMenuSub className="ml-6 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                                    {item.subItems.map((subItem) => {
                                      const isSubActive = isUrlActive(pathname, subItem.url, allSubItemUrls)

                                      return (
                                        <SidebarMenuSubItem key={subItem.title}>
                                          <SidebarMenuSubButton
                                            asChild
                                            isActive={isSubActive}
                                            className="rounded-lg hover:bg-sidebar-accent transition-colors duration-200 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:font-semibold"
                                          >
                                            <a href={subItem.url} className="flex items-center gap-2">
                                              {subItem.icon && (
                                                <subItem.icon className="size-3.5" />
                                              )}
                                              <span className="text-sm font-medium">{t(subItem.title)}</span>
                                            </a>
                                          </SidebarMenuSubButton>
                                        </SidebarMenuSubItem>
                                      )
                                    })}
                                  </SidebarMenuSub>
                                </CollapsibleContent>
                              </SidebarMenuItem>
                            </Collapsible>
                          )
                        } else {
                          // Simple item without sub-items
                          return (
                            <SidebarMenuItem key={item.title}>
                              <SidebarMenuButton
                                asChild
                                tooltip={t(item.title)}
                                isActive={isActive}
                                className="rounded-xl hover:bg-sidebar-accent transition-all duration-200 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:font-semibold"
                              >
                                <a href={item.url} className="flex items-center gap-2">
                                  {item.icon && (
                                    <item.icon className="size-4 ml-1" />
                                  )}
                                  <span className="font-semibold text-sm">{t(item.title)}</span>
                                </a>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          )
                        }
                      })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
