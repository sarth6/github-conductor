import type { ConductorUrlConfig, PRMetadata } from './types';
import { renderTemplate } from './template';

/**
 * Build a `conductor://` deep link URL.
 *
 * The URL is constructed in two phases so that the final `prompt` value is
 * always properly URL-encoded regardless of what characters appear in the
 * rendered template:
 *
 *   1. Render the user-facing prompt template with PR metadata (plain text).
 *   2. Substitute the special `{prompt}` token in the URL template with the
 *      URL-encoded prompt. Other PR metadata placeholders in the URL template
 *      are also URL-encoded.
 *
 * This keeps the URL template authorable (`conductor://new?prompt={prompt}`)
 * while preventing malformed URLs when the PR title contains `&`, `=`, `#`,
 * spaces, newlines, etc.
 */
export function buildConductorUrl(
  urlConfig: ConductorUrlConfig,
  promptTemplate: string,
  metadata: PRMetadata,
): string {
  const renderedPrompt = renderTemplate(promptTemplate, metadata);

  // Replace {prompt} (URL-encoded) and any PR metadata placeholders (URL-encoded).
  return urlConfig.template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, name: string) => {
    if (name === 'prompt') return encodeURIComponent(renderedPrompt);
    if (name in metadata) {
      return encodeURIComponent(metadata[name as keyof PRMetadata]);
    }
    return match;
  });
}

/**
 * Sanity-check a URL template before saving.
 * Returns null if valid, an error message otherwise.
 */
export function validateUrlTemplate(template: string): string | null {
  if (!template.trim()) return 'URL template cannot be empty.';
  if (!template.startsWith('conductor://')) {
    return 'URL template must start with "conductor://".';
  }
  if (!template.includes('{prompt}')) {
    return 'URL template must include the {prompt} placeholder.';
  }
  return null;
}
