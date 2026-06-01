import Link from 'next/link';
import { ArrowRight, Layers, Compass, Sparkles, Brain } from 'lucide-react';

const experiences = [
  {
    title: 'Combined Experience',
    description: 'Search and chat in a single interface — results with conversational follow-ups.',
    href: '/experience/combined-experience',
    icon: Layers,
  },
  {
    title: 'Guided Search',
    description: 'Step-by-step search wizard with interactive filter refinement and AI summaries.',
    href: '/experience/guided-search',
    icon: Compass,
  },
  {
    title: 'AI Search',
    description: 'Search with a conversational AI sidebar for intent detection and refinement.',
    href: '/experience/ai-search',
    icon: Sparkles,
  },
  {
    title: 'Smart Search',
    description: 'Search that learns from session activity to reorder facets and personalize results.',
    href: '/experience/smart-search',
    icon: Brain,
  },
];

export default function ExperienceListingPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Experience patterns</h1>
        <p className="text-muted-foreground">
          Different ways to blend search and chat in your product.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {experiences.map((exp) => (
          <Link
            key={exp.href}
            href={exp.href}
            className="group rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <exp.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-medium mb-1 flex items-center gap-1.5">
                  {exp.title}
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {exp.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
