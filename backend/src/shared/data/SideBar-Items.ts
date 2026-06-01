import {
    Bot,
    Search,
    Settings,
    BarChart3,
    BookOpen,
    Home,
    Database,
    MessageSquare,
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
} from "lucide-react";

export const sidebarGroups = [
    {
        name: "sidebar.groups.main",
        icon: Home,
        items: [
            {
                title: "sidebar.items.dashboard",
                url: "/dashboard",
                icon: Home,
            },
            {
                title: "sidebar.items.docs",
                url: "/docs",
                icon: BookOpen,
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
        name: "sidebar.groups.capabilities",
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
        name: "sidebar.groups.playground",
        icon: TestTube,
        items: [
            {
                title: "sidebar.items.dropinWidget",
                url: "/playground/widget",
                icon: MessageCircle,
            },
            {
                title: "sidebar.items.aiServices",
                url: "/playground/ai-service",
                icon: Bot,
            },
            {
                title: "sidebar.items.indexSearch",
                url: "/playground/search",
                icon: Search,
            },
        ]
    },
    {
        name: "sidebar.groups.analytics",
        icon: BarChart3,
        items: [
            {
                title: "sidebar.items.overview",
                url: "/analytics/overview",
                icon: Activity,
            },
            {
                title: "sidebar.items.chat",
                url: "/analytics/chat",
                icon: MessageSquare,
            },
            {
                title: "sidebar.items.traces",
                url: "/analytics/traces",
                icon: FileText,
            },
        ]
    },
    {
        name: "sidebar.groups.platform",
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
                title: "sidebar.items.healthMonitoring",
                url: "/health",
                icon: Activity,
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
