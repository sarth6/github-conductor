/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { isPrPage, scrapePr } from '../src/pr-scraper';

function makeLocation(pathname: string, hostname = 'github.com'): Location {
  return {
    hostname,
    pathname,
    origin: `https://${hostname}`,
    href: `https://${hostname}${pathname}`,
  } as unknown as Location;
}

/** Parse an HTML snippet into a fresh Document — avoids innerHTML and keeps DOM hermetic. */
function parseDoc(html: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html>${html}</html>`, 'text/html');
}

describe('isPrPage', () => {
  it('matches PR pages', () => {
    expect(isPrPage(makeLocation('/octocat/hello/pull/42'))).toBe(true);
    expect(isPrPage(makeLocation('/octocat/hello/pull/42/files'))).toBe(true);
    expect(isPrPage(makeLocation('/octocat/hello/pull/42/commits'))).toBe(true);
    expect(isPrPage(makeLocation('/octocat/hello/pull/42/checks'))).toBe(true);
  });

  it('does not match non-PR pages', () => {
    expect(isPrPage(makeLocation('/octocat/hello'))).toBe(false);
    expect(isPrPage(makeLocation('/octocat/hello/issues/42'))).toBe(false);
    expect(isPrPage(makeLocation('/octocat/hello/pulls'))).toBe(false);
    expect(isPrPage(makeLocation('/'))).toBe(false);
  });

  it('does not match non-github hostnames', () => {
    expect(isPrPage(makeLocation('/octocat/hello/pull/42', 'evil.example.com'))).toBe(false);
  });
});

describe('scrapePr', () => {
  it('returns ok:false for non-PR pages', () => {
    const result = scrapePr(parseDoc('<head></head><body></body>'), makeLocation('/owner/repo'));
    expect(result).toEqual({ ok: false, reason: 'Not a GitHub PR page' });
  });

  it('extracts structural fields from the URL', () => {
    const doc = parseDoc(`
      <head><title>Bug fix · Pull Request #42 · octocat/hello</title></head>
      <body>
        <h1 class="gh-header-title">
          <bdi class="js-issue-title markdown-title">Bug fix</bdi>
        </h1>
        <a class="pull-header-username">octocat</a>
        <span class="base-ref">main</span>
        <span class="head-ref">feature/bug</span>
        <div class="comment-body markdown-body">This fixes #1.</div>
      </body>
    `);
    const result = scrapePr(doc, makeLocation('/octocat/hello/pull/42/files'));
    if (!result.ok) throw new Error('expected ok');
    expect(result.metadata).toMatchObject({
      prUrl: 'https://github.com/octocat/hello/pull/42',
      prNumber: '42',
      prTitle: 'Bug fix',
      prAuthor: 'octocat',
      prBranch: 'feature/bug',
      prBaseBranch: 'main',
      repo: 'octocat/hello',
      repoOwner: 'octocat',
      repoName: 'hello',
      prDescription: 'This fixes #1.',
      prDiffUrl: 'https://github.com/octocat/hello/pull/42.diff',
      prPatchUrl: 'https://github.com/octocat/hello/pull/42.patch',
    });
  });

  it('falls back to document title when js-issue-title is missing', () => {
    const doc = parseDoc(`
      <head><title>Cool feature · Pull Request #7 · acme/widgets</title></head>
      <body></body>
    `);
    const result = scrapePr(doc, makeLocation('/acme/widgets/pull/7'));
    if (!result.ok) throw new Error('expected ok');
    expect(result.metadata.prTitle).toBe('Cool feature');
  });

  it('falls back to octolytics meta tag for author', () => {
    const doc = parseDoc(`
      <head>
        <meta name="octolytics-actor-login" content="hubot">
      </head>
      <body><h1 class="gh-header-title"><bdi class="js-issue-title">x</bdi></h1></body>
    `);
    const result = scrapePr(doc, makeLocation('/x/y/pull/1'));
    if (!result.ok) throw new Error('expected ok');
    expect(result.metadata.prAuthor).toBe('hubot');
  });

  it('returns empty strings (not null) for missing optional fields', () => {
    const doc = parseDoc('<head><title>x</title></head><body></body>');
    const result = scrapePr(doc, makeLocation('/o/r/pull/9'));
    if (!result.ok) throw new Error('expected ok');
    expect(result.metadata.prAuthor).toBe('');
    expect(result.metadata.prBranch).toBe('');
    expect(result.metadata.prBaseBranch).toBe('');
    expect(result.metadata.prDescription).toBe('');
  });
});
