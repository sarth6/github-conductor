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
  it('builds the default conductor://new?prompt=... URL', () => {
    const url = buildConductorUrl(
      { template: 'conductor://new?prompt={prompt}' },
      'Review PR: {prTitle}',
      fixture,
    );
    expect(url).toBe(
      `conductor://new?prompt=${encodeURIComponent('Review PR: Fix bug & add tests')}`,
    );
  });

  it('URL-encodes special characters in the rendered prompt', () => {
    const url = buildConductorUrl(
      { template: 'conductor://new?prompt={prompt}' },
      '{prTitle} & {prAuthor}',
      fixture,
    );
    expect(url).toContain('Fix%20bug%20%26%20add%20tests');
    expect(url).toContain('%26%20octocat');
  });

  it('encodes PR metadata placeholders used directly in the URL template', () => {
    const url = buildConductorUrl(
      { template: 'conductor://new?prompt={prompt}&path={repo}' },
      'go',
      fixture,
    );
    expect(url).toBe('conductor://new?prompt=go&path=octocat%2Fhello');
  });

  it('preserves the path query param example from the Conductor changelog', () => {
    // Conductor v0.36.4: "handle prompt and path parameters"
    const url = buildConductorUrl(
      { template: 'conductor://new?prompt={prompt}&path=/Users/me/code/{repoName}' },
      'Look at #{prNumber}',
      fixture,
    );
    expect(url).toBe(
      `conductor://new?prompt=${encodeURIComponent('Look at #42')}&path=/Users/me/code/hello`,
    );
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
