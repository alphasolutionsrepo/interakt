'use client'

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from 'react-i18next';
import {
    Search,
    Database,
    ArrowRight,
    Target,
    MessageSquare,
    ChevronRight,
    Sparkles
} from "lucide-react";

export default function Home() {
    const { t, ready } = useTranslation();

    if (!ready) {
        return <div className="min-h-screen flex items-center justify-center">{t('home.loading')}</div>;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10 px-4 sm:px-6 lg:px-8">
            <div className="container mx-auto py-10 lg:py-14">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-12"
                >
                    <Badge variant="secondary" className="mb-4 px-4 py-1.5 text-xs font-bold">
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        {t('home.badge.title')}
                    </Badge>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent leading-[1.1] pb-1">
                        {t('home.hero.title')}
                    </h1>
                    <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed font-medium">
                        {t('home.hero.description')}
                    </p>
                </motion.div>

                {/* Feature Grid */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="grid md:grid-cols-3 gap-5 mb-14"
                >
                    <FeatureCard
                        icon={<Database className="h-7 w-7 stroke-[2]" />}
                        title={t('home.features.searchIndexes.title')}
                        description={t('home.features.searchIndexes.description')}
                        href="/search-indexes"
                        gradient="from-blue-500/20 to-cyan-500/20"
                        iconColor="text-blue-600 dark:text-blue-400"
                    />
                    <FeatureCard
                        icon={<Target className="h-7 w-7 stroke-[2]" />}
                        title={t('home.features.searchTuning.title')}
                        description={t('home.features.searchTuning.description')}
                        href="/playground/search"
                        gradient="from-emerald-500/20 to-green-500/20"
                        iconColor="text-emerald-600 dark:text-emerald-400"
                    />
                    <FeatureCard
                        icon={<MessageSquare className="h-7 w-7 stroke-[2]" />}
                        title={t('home.features.aiChatFlows.title')}
                        description={t('home.features.aiChatFlows.description')}
                        href="/analytics"
                        gradient="from-violet-500/20 to-purple-500/20"
                        iconColor="text-violet-600 dark:text-violet-400"
                    />
                </motion.div>

                {/* Quick Start Section */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                    className="max-w-3xl mx-auto"
                >
                    <div className="relative">
                        {/* Glow effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/30 to-primary/20 blur-2xl opacity-50 rounded-2xl" />

                        <Card className="relative border-border/50 shadow-xl bg-gradient-to-br from-card via-card to-muted/30 backdrop-blur-sm">
                            <CardContent className="p-6 md:p-8">
                                <div className="text-center mb-6">
                                    <h2 className="text-xl md:text-2xl font-bold mb-2 tracking-tight">{t('home.quickStart.title')}</h2>
                                    <p className="text-sm text-muted-foreground font-medium max-w-xl mx-auto">
                                        {t('home.quickStart.description')}
                                    </p>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                    <Button asChild size="default" className="group h-10 px-5 text-sm font-semibold rounded-lg shadow-md hover:shadow-lg transition-all">
                                        <Link href="/search-indexes">
                                            <Database className="mr-2 h-4 w-4" />
                                            {t('home.quickStart.createIndex')}
                                            <ChevronRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                        </Link>
                                    </Button>
                                    <Button asChild variant="outline" size="default" className="group h-10 px-5 text-sm font-semibold rounded-lg border hover:bg-accent transition-all">
                                        <Link href="/playground/search">
                                            <Search className="mr-2 h-4 w-4" />
                                            {t('home.quickStart.tryPlayground')}
                                            <ChevronRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                        </Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </motion.div>

                {/* Status Bar */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.6 }}
                    className="mt-10 text-center"
                >
                    <div className="inline-flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-500/30 blur-sm"></div>
                            </div>
                            {t('common.platformOnline')}
                        </div>
                        <div className="w-px h-4 bg-border"></div>
                        <Link
                            href="/docs"
                            target="_blank"
                            className="hover:text-foreground transition-colors flex items-center gap-1.5 group"
                        >
                            {t('common.documentation')}
                            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

function FeatureCard({
    icon,
    title,
    description,
    href,
    gradient,
    iconColor,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    href: string;
    gradient: string;
    iconColor: string;
}) {
    const { t } = useTranslation();

    return (
        <motion.div
            whileHover={{ y: -3 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="h-full"
        >
            <Link href={href} className="block h-full">
                <div className="relative h-full group cursor-pointer">
                    {/* Glow effect - only visible on hover */}
                    <div className={`absolute -inset-0.5 bg-gradient-to-r ${gradient} rounded-2xl blur-xl opacity-0 group-hover:opacity-70 transition-opacity duration-500`} />

                    <Card className="relative h-full border-border/60 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-card via-card to-muted/20">
                        <CardContent className="p-5 flex flex-col h-full">
                            {/* Icon container */}
                            <div className="relative mb-4">
                                <div className={`absolute inset-0 bg-gradient-to-br ${gradient} rounded-xl blur-md opacity-50 group-hover:opacity-70 transition-opacity duration-300`} />
                                <div className={`relative w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-md`}>
                                    <div className={iconColor}>
                                        {icon}
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors tracking-tight">
                                {title}
                            </h3>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">
                                {description}
                            </p>

                            {/* CTA */}
                            <div className="flex items-center text-sm font-semibold text-primary group-hover:gap-1.5 transition-all">
                                {t('common.getStarted')}
                                <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform duration-300" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </Link>
        </motion.div>
    );
}