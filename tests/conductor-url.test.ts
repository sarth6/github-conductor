import { describe, expect, it } from 'vitest';
import { buildConductorUrl, validateUrlTemplate } from '../src/conductor-url';
import type { PRMetadata } from '../src/types';

const fixture: PRMetadata = {
  prUrl: 'https://github.com/octocat/hello/pull/42',
  prNumber: '42',
  prTitle: 'Fix bug & add tests',
  prDescription: '',
  prAuthor: 'octocat',
  prBranch: 'feature/cool',
  prBaseBranch: 'main',
  repo: 'octocat/hello',
  repoOwner: 'octocat',
  repoName: 'hello',
  prDiffUrl: 'https://github.com/octocat/hello/pull/42.diff',
  prPatchUrl: 'https://github.com/octocat/hello/pull/42.patch',
};

describe('buildConductorUrl', () => {
  it('builds the default conductor://prompt=… URL (no host, no ?)', () => {
    const url = buildConductorUrl(
      { template: 'conductor://prompt={prompt}' },
      'Review PR: {prTitle}',
      fixture,
    );
    expect(url).toBe(`conductor://prompt=${encodeURIComponent('Review PR: Fix bug & add tests')}`);
  });

  it('URL-encodes special characters in the rendered prompt', () => {
    const url = buildConductorUrl(
      { template: 'conductor://prompt={prompt}' },
      '{prTitle} & {prAuthor}',
      fixture,
    );
    expect(url).toContain('Fix%20bug%20%26%20add%20tests');
    expect(url).toContain('%26%20octocat');
  });

  it('encodes PR metadata placeholders used directly in the URL template', () => {
    // Legacy ?prompt=…&path=… style still supported for users who want it.
    const url = buildConductorUrl(
      { template: 'conductor://prompt={prompt}&path={repo}' },
      'go',
      fixture,
    );
    expect(url).toBe('conductor://prompt=go&path=octocat%2Fhello');
  });
});

describe('validateUrlTemplate', () => {
  it('accepts a valid template', () => {
    expect(validateUrlTemplate('conductor://new?prompt={prompt}')).toBeNull();
  });

  it('rejects an empty template', () => {
    expect(validateUrlTemplate('')).toMatch(/empty/i);
    expect(validateUrlTemplate('   ')).toMatch(/empty/i);
  });

  it('rejects a template with the wrong scheme', () => {
    expect(validateUrlTemplate('https://example.com?prompt={prompt}')).toMatch(/conductor:/i);
  });

  it('rejects a template missing {prompt}', () => {
    expect(validateUrlTemplate('conductor://new')).toMatch(/\{prompt\}/);
  });
});
