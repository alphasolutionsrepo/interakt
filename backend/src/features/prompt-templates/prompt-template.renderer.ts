// src/features/prompt-templates/prompt-template.renderer.ts

/**
 * Prompt Template Renderer
 *
 * Renders a prompt template by:
 * 1. Replacing {{variable}} placeholders with runtime values
 * 2. Evaluating {{#if variable}}...{{/if}} conditional blocks
 * 3. Stripping <!-- section:id --> markers (metadata, not prompt content)
 *
 * Deliberately simple — no full Handlebars dependency, just the 3 constructs needed.
 */

// ============================================================================
// RENDERER
// ============================================================================

/**
 * Render a prompt template with the provided variables.
 *
 * @param content - The template content with {{variable}} placeholders
 * @param variables - Key-value map of variable values
 * @returns The fully rendered prompt string
 */
export function renderTemplate(
  content: string,
  variables: Record<string, string | undefined>,
): string {
  let result = content;

  // 1. Evaluate {{#if variable}}...{{/if}} conditional blocks
  result = evaluateConditionals(result, variables);

  // 2. Replace {{variable}} placeholders
  result = replaceVariables(result, variables);

  // 3. Strip section markers (they're metadata for the admin UI, not prompt content)
  result = stripSectionMarkers(result);

  // 4. Clean up any double blank lines left by conditional removal
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return result;
}

// ============================================================================
// INTERNALS
// ============================================================================

/**
 * Evaluate {{#if variable}}...{{/if}} blocks.
 * If the variable is truthy (non-empty string), include the content.
 * If falsy (undefined, empty string), remove the entire block.
 */
function evaluateConditionals(content: string, variables: Record<string, string | undefined>): string {
  // Match {{#if varName}}...{{/if}} — non-greedy, supports multiline
  const ifPattern = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

  return content.replace(ifPattern, (_match, varName: string, blockContent: string) => {
    const value = variables[varName];
    if (value && value.trim().length > 0) {
      // Include the block content (without the if/endif tags)
      return blockContent;
    }
    // Remove the entire block
    return '';
  });
}

/**
 * Replace {{variable}} placeholders with their values.
 * Unknown variables are replaced with empty string.
 */
function replaceVariables(content: string, variables: Record<string, string | undefined>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
    return variables[varName] ?? '';
  });
}

/**
 * Strip <!-- section:id --> and <!-- /section:id --> markers.
 * These are metadata for the admin UI, not part of the prompt sent to AI.
 */
function stripSectionMarkers(content: string): string {
  return content.replace(/<!--\s*\/?section:\w+\s*-->\n?/g, '');
}

// Exported for testing
export { evaluateConditionals as _evaluateConditionals, replaceVariables as _replaceVariables, stripSectionMarkers as _stripSectionMarkers };
