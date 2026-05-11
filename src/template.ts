import type { PRMetadata } from './types';

/** Regex matching `{placeholderName}` — letters, digits, underscores allowed inside braces. */
const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/** List of valid placeholder names — exported for help text in the options page. */
export const VALID_PLACEHOLDERS = [
  'prUrl',
  'prNumber',
  'prTitle',
  'prDescription',
  'prAuthor',
  'prBranch',
  'prBaseBranch',
  'repo',
  'repoOwner',
  'repoName',
  'prDiffUrl',
  'prPatchUrl',
] as const satisfies ReadonlyArray<keyof PRMetadata>;

export type PlaceholderName = (typeof VALID_PLACEHOLDERS)[number];

/**
 * Render a template by substituting `{placeholder}` tokens with values from `metadata`.
 *
 * Substitution is a plain string replace — placeholder values are never
 * interpreted as code or further templated. Unknown placeholders are left
 * literal so users notice typos.
 */
export function renderTemplate(template: string, metadata: PRMetadata): string {
  return template.replace(PLACEHOLDER_RE, (match, name: string) => {
    if (isValidPlaceholder(name)) {
      return metadata[name];
    }
    return match; // leave unknown placeholders untouched for visibility
  });
}

export function isValidPlaceholder(name: string): name is PlaceholderName {
  return (VALID_PLACEHOLDERS as ReadonlyArray<string>).includes(name);
}

/**
 * Find all placeholder names used in a template. Useful for validating
 * templates in the options UI before saving.
 */
export function extractPlaceholders(template: string): string[] {
  const out = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    out.add(match[1]);
  }
  return [...out];
}

/** Find any placeholder names in a template that aren't recognized. */
export function findUnknownPlaceholders(template: string): string[] {
  return extractPlaceholders(template).filter((p) => !isValidPlaceholder(p));
}
