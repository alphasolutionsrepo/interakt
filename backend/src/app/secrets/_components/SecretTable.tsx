'use client';

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SecretMetadata } from '../_lib/api-client';

interface SecretTableProps {
  secrets: SecretMetadata[];
  onEdit: (secret: SecretMetadata) => void;
  onDelete: (secret: SecretMetadata) => void;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function SecretTable({ secrets, onEdit, onDelete }: SecretTableProps) {
  if (secrets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/60 mb-4">
          <span className="text-2xl">🔑</span>
        </div>
        <p className="font-medium text-sm">No secrets yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Create your first secret to use in tool configurations.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Name</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Value</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground hidden md:table-cell">Description</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Updated</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground hidden xl:table-cell">Created</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {secrets.map((secret) => (
            <TableRow
              key={secret.id}
              className="group cursor-default transition-colors hover:bg-muted/20"
            >
              <TableCell>
                <code className="font-mono text-sm font-medium text-foreground">
                  {secret.name}
                </code>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {`{{secret:${secret.name}}}`}
                </p>
              </TableCell>
              <TableCell>
                <code className="font-mono text-sm text-muted-foreground tracking-widest select-none">
                  ••••••••
                </code>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <span className="text-sm text-muted-foreground line-clamp-1">
                  {secret.description ?? <span className="italic text-muted-foreground/50">No description</span>}
                </span>
              </TableCell>
              <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                {formatDate(secret.updatedAt)}
              </TableCell>
              <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                {formatDate(secret.createdAt)}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(secret)}>
                      <Pencil className="mr-2 size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(secret)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
