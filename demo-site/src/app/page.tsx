import Link from "next/link";
import { ArrowRight, MessageSquare, Search, Layers, Boxes } from "lucide-react";

const demos = [
  {
    title: "Search",
    description: "Lexical, semantic, and hybrid search with facets, autocomplete, and AI summaries.",
    href: "/search-interface",
    icon: Search,
  },
  {
    title: "Chat",
    description: "Conversational AI with tool calls, streaming, and rich product cards.",
    href: "/chat",
    icon: MessageSquare,
  },
  {
    title: "Experience",
    description: "Blended search + chat patterns: combined, guided, AI-assisted, and session-aware.",
    href: "/experience",
    icon: Layers,
  },
  {
    title: "Drop-in UI",
    description: "Embed Interakt as a widget on any page.",
    href: "/dropin-demo",
    icon: Boxes,
  },
];

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Demos</h1>
        <p className="text-muted-foreground">
          Try Interakt&apos;s search and chat experiences.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {demos.map((demo) => (
          <Link
            key={demo.href}
            href={demo.href}
            className="group rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <demo.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-medium mb-1 flex items-center gap-1.5">
                  {demo.title}
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {demo.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
