// app/search-indexes/_components/ImportWizard/import-blocking.ts

/**
 * The reason an import preview can't go ahead, or undefined when it can. The preview lists
 * problems that would make the import itself fail; the wizard shows them and offers no
 * Next/Import until a different file is chosen.
 */

export function importBlockingMessage(preview: { blockingErrors?: string[] }): string | undefined {
    const errors = preview.blockingErrors ?? [];
    return errors.length > 0 ? errors.join(' ') : undefined;
}
