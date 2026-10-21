'use client';

/**
 * A trace without the visitor's words comes from 'Metadata only' telemetry: 'Off'
 * records no trace and 'Full' records the words. Says so, and how to change it.
 */
export function NotStored({ content }: { content: 'query' | 'message' }) {
  const noun = content === 'query' ? 'Query' : 'Message';
  return (
    <span
      className="italic font-normal text-muted-foreground"
      title={`Recorded with the experience's Telemetry setting on "Metadata only", which doesn't store what visitors ${content === 'query' ? 'search for' : 'write'}. Set it to "Full" to see ${content === 'query' ? 'queries' : 'messages'} in new traces.`}
    >
      {noun} not stored · Metadata only
    </span>
  );
}

/** A query or message that was stored but is blank */
export function EmptyMessage({ content }: { content: 'query' | 'message' }) {
  return <span className="italic font-normal text-muted-foreground">Empty {content}</span>;
}
