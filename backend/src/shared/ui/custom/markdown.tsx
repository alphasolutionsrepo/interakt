import Link from "next/link";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

interface MarkdownProps {
  children: string;
  className?: string;
  /**
   * When provided, internal links (relative or root-relative, non-http) render
   * as in-place buttons that call this with the raw href instead of navigating
   * away. External links keep their default new-tab behavior. Used by the help
   * drawer to browse between docs without leaving the panel.
   */
  onInternalLink?: (href: string) => void;
}

const NonMemoizedMarkdown = ({ children, className, onInternalLink }: MarkdownProps) => {
  const components = {
    // Code blocks and inline code
    code: ({ node, inline, className: codeClassName, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(codeClassName || "");
      return !inline && match ? (
        <pre
          {...props}
          className={`${codeClassName} text-sm w-full overflow-x-auto bg-zinc-100 p-3 rounded-lg mt-2 dark:bg-zinc-800`}
        >
          <code className={match[1]}>{children}</code>
        </pre>
      ) : (
        <code
          className={`${codeClassName || ''} text-sm bg-zinc-100 dark:bg-zinc-800 py-0.5 px-1 rounded-md`}
          {...props}
        >
          {children}
        </code>
      );
    },
    // Headings
    h1: ({ node, children, ...props }: any) => (
      <h1 className="text-xl font-bold mt-4 mb-2" {...props}>{children}</h1>
    ),
    h2: ({ node, children, ...props }: any) => (
      <h2 className="text-lg font-bold mt-4 mb-2" {...props}>{children}</h2>
    ),
    h3: ({ node, children, ...props }: any) => (
      <h3 className="text-base font-bold mt-3 mb-1" {...props}>{children}</h3>
    ),
    h4: ({ node, children, ...props }: any) => (
      <h4 className="text-sm font-bold mt-2 mb-1" {...props}>{children}</h4>
    ),
    // Paragraphs
    p: ({ node, children, ...props }: any) => (
      <p className="mb-2 last:mb-0" {...props}>{children}</p>
    ),
    // Lists
    ol: ({ node, children, ...props }: any) => (
      <ol className="list-decimal list-outside ml-4 mb-2" {...props}>
        {children}
      </ol>
    ),
    ul: ({ node, children, ...props }: any) => (
      <ul className="list-disc list-outside ml-4 mb-2" {...props}>
        {children}
      </ul>
    ),
    li: ({ node, children, ...props }: any) => (
      <li className="py-0.5" {...props}>
        {children}
      </li>
    ),
    // Text formatting
    strong: ({ node, children, ...props }: any) => (
      <strong className="font-semibold" {...props}>
        {children}
      </strong>
    ),
    em: ({ node, children, ...props }: any) => (
      <em className="italic" {...props}>
        {children}
      </em>
    ),
    // Links - internal links browse in place (when a handler is given);
    // external links open in a new tab, styled as modern pill buttons.
    a: ({ node, children, href, ...props }: any) => {
      const url = String(href || '');
      const isExternal = /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');
      if (onInternalLink && url && !isExternal && !url.startsWith('#')) {
        return (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onInternalLink(url);
            }}
            className="font-medium text-blue-600 underline underline-offset-2 hover:opacity-80 dark:text-blue-400"
          >
            {children}
          </button>
        );
      }
      return (
        <Link
          href={url || '#'}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/30 transition-colors no-underline"
          target="_blank"
          rel="noreferrer"
          {...props}
        >
          {children}
          <ExternalLink className="h-3 w-3 opacity-70" />
        </Link>
      );
    },
    // Blockquotes
    blockquote: ({ node, children, ...props }: any) => (
      <blockquote
        className="border-l-4 border-zinc-300 dark:border-zinc-600 pl-4 my-2 italic text-zinc-600 dark:text-zinc-400"
        {...props}
      >
        {children}
      </blockquote>
    ),
    // Images - compact thumbnail size for chat
    img: ({ node, src, alt, ...props }: any) => (
      <span className="inline-block my-2 mr-2 align-top">
        <a href={src} target="_blank" rel="noreferrer" className="block group">
          <img
            src={src}
            alt={alt || "Image"}
            className="w-auto h-auto rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm group-hover:shadow-md transition-shadow"
            style={{ maxHeight: '120px', maxWidth: '160px', objectFit: 'cover' }}
            loading="lazy"
            onError={(e) => {
              // Hide broken images
              (e.target as HTMLImageElement).style.display = 'none';
            }}
            {...props}
          />
        </a>
        {alt && alt !== 'Image' && (
          <span className="block text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-[160px] truncate">
            {alt}
          </span>
        )}
      </span>
    ),
    // Horizontal rule
    hr: ({ node, ...props }: any) => (
      <hr className="my-4 border-zinc-200 dark:border-zinc-700" {...props} />
    ),
    // Tables
    table: ({ node, children, ...props }: any) => (
      <div className="overflow-x-auto my-3">
        <table
          className="min-w-full text-sm border-collapse border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden"
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ node, children, ...props }: any) => (
      <thead className="bg-zinc-100 dark:bg-zinc-800" {...props}>
        {children}
      </thead>
    ),
    tbody: ({ node, children, ...props }: any) => (
      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700" {...props}>
        {children}
      </tbody>
    ),
    tr: ({ node, children, ...props }: any) => (
      <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50" {...props}>
        {children}
      </tr>
    ),
    th: ({ node, children, ...props }: any) => (
      <th
        className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-700"
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ node, children, ...props }: any) => (
      <td
        className="px-3 py-2 text-zinc-600 dark:text-zinc-400"
        {...props}
      >
        {children}
      </td>
    ),
  };

  return (
    <div className={cn("prose-sm", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.className === nextProps.className &&
    prevProps.onInternalLink === nextProps.onInternalLink,
);
