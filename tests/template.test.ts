import { describe, expect, it } from 'vitest';
import {
  extractPlaceholders,
  findUnknownPlaceholders,
  isValidPlaceholder,
  renderTemplate,
  VALID_PLACEHOLDERS,
} from '../src/template';
import type { PRMetadata } from '../src/types';

const fixture: PRMetadata = {
  prUrl: 'https://github.com/octocat/hello/pull/42',
  prNumber: '42',
  prTitle: 'Add cool feature',
  prDescription: 'A long description with $pecial chars & symbols.',
  prAuthor: 'octocat',
  prBranch: 'feature/cool',
  prBaseBranch: 'main',
  repo: 'octocat/hello',
  repoOwner: 'octocat',
  repoName: 'hello',
  prDiffUrl: 'https://github.com/octocat/hello/pull/42.diff',
  prPatchUrl: 'https://github.com/octocat/hello/pull/42.patch',
};

describe('renderTemplate', () => {
  it('substitutes known placeholders', () => {
    const out = renderTemplate('Review {prTitle} on {repo} (#{prNumber})', fixture);
    expect(out).toBe('Review Add cool feature on octocat/hello (#42)');
  });

  it('leaves unknown placeholders untouched', () => {
    const out = renderTemplate('Hello {unknown} and {prTitle}', fixture);
    expect(out).toBe('Hello {unknown} and Add cool feature');
  });

  it('does not re-interpret substituted values (no template injection)', () => {
    const evil: PRMetadata = { ...fixture, prTitle: '{prAuthor}' };
    // Substituted "{prAuthor}" must stay literal — not turn into "octocat".
    expect(renderTemplate('{prTitle}', evil)).toBe('{prAuthor}');
  });

  it('handles a template with no placeholders', () => {
    expect(renderTemplate('plain text', fixture)).toBe('plain text');
  });

  it('handles repeated placeholders', () => {
    expect(renderTemplate('{prNumber}-{prNumber}', fixture)).toBe('42-42');
  });

  it('supports every documented placeholder', () => {
    for (const name of VALID_PLACEHOLDERS) {
      const out = renderTemplate(`<${name}>: {${name}}`, fixture);
      expect(out).toBe(`<${name}>: ${fixture[name]}`);
    }
  });
});

describe('isValidPlaceholder', () => {
  it('returns true for each documented placeholder', () => {
    for (const name of VALID_PLACEHOLDERS) {
      expect(isValidPlaceholder(name)).toBe(true);
    }
  });

  it('returns false for unknown names', () => {
    expect(isValidPlaceholder('garbage')).toBe(false);
    expect(isValidPlaceholder('PRTITLE')).toBe(false); // case-sensitive
  });
});

describe('extractPlaceholders', () => {
  it('returns the unique placeholder names used in a template', () => {
    expect(extractPlaceholders('{prTitle} and {prNumber} again {prTitle}')).toEqual([
      'prTitle',
      'prNumber',
    ]);
  });

  it('returns an empty array for a plain template', () => {
    expect(extractPlaceholders('no placeholders here')).toEqual([]);
  });
});

describe('findUnknownPlaceholders', () => {
  it('reports only unknown names', () => {
    expect(findUnknownPlaceholders('{prTitle} {oops} {alsoBad}')).toEqual(['oops', 'alsoBad']);
  });
});
