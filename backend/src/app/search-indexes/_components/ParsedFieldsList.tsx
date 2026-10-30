// app/search-indexes/_components/ParsedFieldsList.tsx

'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    Search,
    ChevronDown,
    ChevronRight,
    FileJson,
    Type,
    Hash,
    ToggleLeft,
    Braces,
    List,
    HelpCircle,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ParsedSourceField, InferredFieldType } from '@/features/search-index';

// ============================================================================
// TYPES
// ============================================================================

interface ParsedFieldsListProps {
    fields: ParsedSourceField[];
    recordCount: number;
    onFieldSelect?: (field: ParsedSourceField) => void;
    selectedFieldPath?: string | null;
    className?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTypeIcon(type: InferredFieldType) {
    switch (type) {
        case 'string':
            return <Type className="h-3.5 w-3.5" />;
        case 'number':
            return <Hash className="h-3.5 w-3.5" />;
        case 'boolean':
            return <ToggleLeft className="h-3.5 w-3.5" />;
        case 'object':
            return <Braces className="h-3.5 w-3.5" />;
        case 'array:string':
        case 'array:number':
        case 'array:boolean':
        case 'array:object':
        case 'array:mixed':
            return <List className="h-3.5 w-3.5" />;
        case 'null':
        case 'unknown':
        default:
            return <HelpCircle className="h-3.5 w-3.5" />;
    }
}

function getTypeBadgeColor(type: InferredFieldType): string {
    switch (type) {
        case 'string':
            return 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
        case 'number':
            return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800';
        case 'boolean':
            return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
        case 'object':
            return 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
        case 'array:string':
        case 'array:number':
        case 'array:boolean':
        case 'array:object':
        case 'array:mixed':
            return 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800';
        case 'null':
            return 'bg-slate-100 dark:bg-muted text-slate-500 border-slate-200 dark:border-border';
        default:
            return 'bg-gray-100 dark:bg-muted text-gray-600 border-gray-200 dark:border-border';
    }
}

function getTypeLabel(type: InferredFieldType): string {
    switch (type) {
        case 'array:string':
            return 'string[]';
        case 'array:number':
            return 'number[]';
        case 'array:boolean':
            return 'boolean[]';
        case 'array:object':
            return 'object[]';
        case 'array:mixed':
            return 'mixed[]';
        default:
            return type;
    }
}

function formatSampleValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

// ============================================================================
// SUB COMPONENTS
// ============================================================================

interface FieldItemProps {
    field: ParsedSourceField;
    isSelected: boolean;
    onClick?: () => void;
}

function FieldItem({ field, isSelected, onClick }: FieldItemProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const hasNestedPath = field.path.includes('.');

    return (
        <div
            className={cn(
                'border rounded-lg transition-colors',
                isSelected
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40'
                    : 'border-slate-200 dark:border-border hover:border-slate-300 hover:bg-slate-50',
                onClick && 'cursor-pointer'
            )}
            onClick={onClick}
        >
            <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        {/* Field Path */}
                        <div className="flex items-center gap-2">
                            <code className="font-mono text-sm font-medium text-slate-900 dark:text-foreground truncate">
                                {field.path}
                            </code>
                            {hasNestedPath && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1 bg-slate-100 dark:bg-muted">
                                    nested
                                </Badge>
                            )}
                        </div>

                        {/* Type Badge */}
                        <div className="flex items-center gap-2 mt-1.5">
                            <Badge
                                variant="outline"
                                className={cn(
                                    'text-xs font-mono flex items-center gap-1',
                                    getTypeBadgeColor(field.inferredType)
                                )}
                            >
                                {getTypeIcon(field.inferredType)}
                                {getTypeLabel(field.inferredType)}
                            </Badge>
                        </div>
                    </div>

                    {/* Expand button for sample value */}
                    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                        <CollapsibleTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronRight className="h-4 w-4" />
                                )}
                            </Button>
                        </CollapsibleTrigger>
                    </Collapsible>
                </div>

                {/* Sample Value (collapsible) */}
                <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                    <CollapsibleContent>
                        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-border">
                            <p className="text-xs text-slate-500 mb-1">Sample value:</p>
                            <code className="text-xs font-mono text-slate-700 dark:text-muted-foreground bg-slate-100 dark:bg-muted px-2 py-1 rounded block overflow-x-auto">
                                {formatSampleValue(field.sampleValue)}
                            </code>
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            </div>
        </div>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ParsedFieldsList({
    fields,
    recordCount,
    onFieldSelect,
    selectedFieldPath,
    className,
}: ParsedFieldsListProps) {
    const [searchQuery, setSearchQuery] = useState('');

    // Filter fields based on search
    const filteredFields = useMemo(() => {
        if (!searchQuery.trim()) return fields;

        const query = searchQuery.toLowerCase();
        return fields.filter(
            (field) =>
                field.path.toLowerCase().includes(query) ||
                field.name.toLowerCase().includes(query) ||
                field.inferredType.toLowerCase().includes(query)
        );
    }, [fields, searchQuery]);

    // Group fields by depth for better organization
    const { rootFields, nestedFields } = useMemo(() => {
        const root: ParsedSourceField[] = [];
        const nested: ParsedSourceField[] = [];

        filteredFields.forEach((field) => {
            if (field.depth === 0) {
                root.push(field);
            } else {
                nested.push(field);
            }
        });

        return { rootFields: root, nestedFields: nested };
    }, [filteredFields]);

    if (fields.length === 0) {
        return (
            <Card className={cn('border-slate-200 dark:border-border', className)}>
                <CardContent className="p-6">
                    <div className="text-center text-slate-500">
                        <FileJson className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                        <p>No source fields detected</p>
                        <p className="text-sm mt-1">
                            Provide JSON data to extract available fields
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn('border-slate-200 dark:border-border', className)}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-foreground">
                            <FileJson className="h-5 w-5" />
                            Source Fields
                        </CardTitle>
                        <CardDescription>
                            {fields.length} field{fields.length !== 1 ? 's' : ''} extracted from{' '}
                            {recordCount} record{recordCount !== 1 ? 's' : ''}
                        </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-xs">
                        {fields.length} fields
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search fields..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-9"
                    />
                    {searchQuery && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                            onClick={() => setSearchQuery('')}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                {/* Fields List */}
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                    {/* Root Level Fields */}
                    {rootFields.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                Root Fields ({rootFields.length})
                            </p>
                            <div className="space-y-2">
                                {rootFields.map((field) => (
                                    <FieldItem
                                        key={field.path}
                                        field={field}
                                        isSelected={selectedFieldPath === field.path}
                                        onClick={
                                            onFieldSelect
                                                ? () => onFieldSelect(field)
                                                : undefined
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Nested Fields */}
                    {nestedFields.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                Nested Fields ({nestedFields.length})
                            </p>
                            <div className="space-y-2">
                                {nestedFields.map((field) => (
                                    <FieldItem
                                        key={field.path}
                                        field={field}
                                        isSelected={selectedFieldPath === field.path}
                                        onClick={
                                            onFieldSelect
                                                ? () => onFieldSelect(field)
                                                : undefined
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* No results */}
                    {filteredFields.length === 0 && searchQuery && (
                        <div className="text-center py-6 text-slate-500">
                            <p>No fields match &quot;{searchQuery}&quot;</p>
                            <Button
                                variant="link"
                                size="sm"
                                onClick={() => setSearchQuery('')}
                            >
                                Clear search
                            </Button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export default ParsedFieldsList;