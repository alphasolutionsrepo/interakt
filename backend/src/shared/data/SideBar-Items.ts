import {
    Bot,
    Search,
    Settings,
    BarChart3,
    BookOpen,
    Home,
    Database,
    Activity,
    Cog,
    Plus,
    TestTube,
    Users,
    Shield,
    Wrench,
    MemoryStick,
    Sparkles,
    FileText,
    SlidersHorizontal,
    Layers,
    ListTree,
    Cpu,
    KeyRound,
    Rocket,
    Boxes,
    MessageCircle,
    Clock,
    HeartPulse,
    type LucideIcon,
} from "lucide-react";

export interface SidebarItem {
    /** Translation key */
    title: string;
    url: string;
    icon: LucideIcon;
    subItems?: SidebarItem[];
}

export interface SidebarGroupDef {
    /** Translation key */
    name: string;
    icon: LucideIcon;
    /** No heading above the group (e.g. a group of one) */
    hideLabel?: boolean;
    items: SidebarItem[];
}

/**
 * The sidebar, in the order admins use it: the daily pages first (Dashboard,
 * then Monitor), then what you build and test, then administration. Docs are
 * help rather than configuration, so they sit at the bottom (sidebarFooterItems).
 */
export const sidebarGroups: SidebarGroupDef[] = [
    {
        name: "sidebar.groups.main",
        // A single item needs no heading
        hideLabel: true,
        icon: Home,
        items: [
            {
                title: "sidebar.items.dashboard",
                url: "/dashboard",
                icon: Home,
            },
        ]
    },
    {
        name: "sidebar.groups.monitor",
        icon: BarChart3,
        items: [
            {
                // The analytics sections, also reachable from the tabs inside Analytics.
                // Its Settings tab is left out here: it's an admin page, not a view.
                title: "sidebar.items.analytics",
                url: "/analytics",
                icon: Activity,
                subItems: [
                    {
                        title: "sidebar.items.overview",
                        url: "/analytics/overview",
                        icon: Activity,
                    },
                    {
                        title: "sidebar.items.analyticsSearch",
                        url: "/analytics/search",
                        icon: Search,
                    },
                    {
                        title: "sidebar.items.conversations",
                        url: "/analytics/conversations",
                        icon: MessageCircle,
                    },
                    {
                        title: "sidebar.items.aiCost",
                        url: "/analytics/ai",
                        icon: Cpu,
                    },
                    {
                        title: "sidebar.items.traces",
                        url: "/analytics/traces",
                        icon: ListTree,
                    },
                ]
            },
            {
                title: "sidebar.items.healthMonitoring",
                url: "/health",
                icon: HeartPulse,
            },
            {
                title: "sidebar.items.backgroundJobs",
                url: "/jobs",
                icon: Clock,
            },
        ]
    },
    {
        name: "sidebar.groups.experiences",
        icon: Sparkles,
        items: [
            {
                title: "sidebar.items.allExperiences",
                url: "/experiences",
                icon: Sparkles,
            },
            {
                title: "sidebar.items.createExperience",
                url: "/experiences/create",
                icon: Plus,
            },
        ]
    },
    {
        name: "sidebar.groups.build",
        icon: Boxes,
        items: [
            {
                title: "sidebar.items.dataSources",
                url: "/data-sources",
                icon: Database,
                subItems: [
                    {
                        title: "sidebar.items.createDataSource",
                        url: "/data-sources/create",
                        icon: Plus,
                    },
                    {
                        title: "sidebar.items.allDataSources",
                        url: "/data-sources",
                        icon: ListTree,
                    },
                ]
            },
            {
                title: "sidebar.items.searchIndexes",
                url: "/search-indexes",
                icon: Layers,
                subItems: [
                    {
                        title: "sidebar.items.createIndex",
                        url: "/search-indexes/create",
                        icon: Plus,
                    },
                    {
                        title: "sidebar.items.allIndexes",
                        url: "/search-indexes",
                        icon: ListTree,
                    },
                ]
            },
            {
                title: "sidebar.items.tools",
                url: "/tools",
                icon: Wrench,
            },
            {
                title: "sidebar.items.mcpConnections",
                url: "/mcp-connections",
                icon: Cpu,
                subItems: [
                    {
                        title: "sidebar.items.createMcpConnection",
                        url: "/mcp-connections/create",
                        icon: Plus,
                    },
                    {
                        title: "sidebar.items.allMcpConnections",
                        url: "/mcp-connections",
                        icon: ListTree,
                    },
                ]
            },
            {
                title: "sidebar.items.promptTemplates",
                url: "/prompt-templates",
                icon: FileText,
            },
        ]
    },
    {
        name: "sidebar.groups.test",
        icon: TestTube,
        items: [
            {
                title: "sidebar.items.dropinWidget",
                url: "/playground/widget",
                icon: MessageCircle,
            },
            {
                title: "sidebar.items.indexSearch",
                url: "/playground/search",
                icon: Search,
            },
            {
                // Tries the configured models directly; not to be confused with AI Providers under Admin
                title: "sidebar.items.aiModels",
                url: "/playground/ai-service",
                icon: Bot,
            },
        ]
    },
    {
        name: "sidebar.groups.admin",
        icon: Shield,
        items: [
            {
                title: "sidebar.items.aiProviders",
                url: "/ai-providers",
                icon: Cog,
            },
            {
                title: "sidebar.items.secrets",
                url: "/secrets",
                icon: KeyRound,
            },
            {
                title: "sidebar.items.settings",
                url: "/settings",
                icon: Settings,
                subItems: [
                    {
                        title: "sidebar.items.searchSettings",
                        url: "/settings/search",
                        icon: SlidersHorizontal,
                    },
                    {
                        title: "sidebar.items.cacheManagement",
                        url: "/settings/cache",
                        icon: MemoryStick,
                    },
                ]
            },
            {
                title: "sidebar.items.userManagement",
                url: "/users",
                icon: Users,
            },
            {
                title: "sidebar.items.initialSetup",
                url: "/setup",
                icon: Rocket,
            },
        ]
    },
];

/** Pinned to the bottom of the sidebar, apart from the work pages */
export const sidebarFooterItems: SidebarItem[] = [
    {
        title: "sidebar.items.docs",
        url: "/docs",
        icon: BookOpen,
    },
];
