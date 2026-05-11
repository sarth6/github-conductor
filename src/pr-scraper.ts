import type { ScrapeResult } from './types';

/**
 * Match `github.com/<owner>/<repo>/pull/<number>` and the conversation /
 * files / checks / commits sub-paths.
 */
const PR_PATH_RE = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/;

/** True if the given location looks like a GitHub PR page we can act on. */
export function isPrPage(loc: Pick<Location, 'hostname' | 'pathname'>): boolean {
  if (loc.hostname !== 'github.com') return false;
  return PR_PATH_RE.test(loc.pathname);
}

/**
 * Extract PR metadata from the current GitHub PR page.
 *
 * Strategy: URL parsing for the "structural" fields (owner / repo / PR number),
 * then DOM selectors for the title / author / branches / description. Selectors
 * are written defensively — every field has a fallback so a GitHub redesign
 * degrades gracefully rather than throwing.
 */
export function scrapePr(
  doc: Document,
  loc: Pick<Location, 'hostname' | 'pathname' | 'href' | 'origin'>,
): ScrapeResult {
  const match = loc.pathname.match(PR_PATH_RE);
  if (loc.hostname !== 'github.com' || !match) {
    return { ok: false, reason: 'Not a GitHub PR page' };
  }
  const [, owner, repoName, prNumber] = match;
  const repo = `${owner}/${repoName}`;
  const prUrl = `${loc.origin}/${owner}/${repoName}/pull/${prNumber}`;

  const prTitle = scrapeTitle(doc);
  const prAuthor = scrapeAuthor(doc);
  const { head, base } = scrapeBranches(doc);
  const prDescription = scrapeDescription(doc);

  return {
    ok: true,
    metadata: {
      prUrl,
      prNumber,
      prTitle,
      prDescription,
      prAuthor,
      prBranch: head,
      prBaseBranch: base,
      repo,
      repoOwner: owner,
      repoName,
      prDiffUrl: `${prUrl}.diff`,
      prPatchUrl: `${prUrl}.patch`,
    },
  };
}

function scrapeTitle(doc: Document): string {
  const titleEl = doc.querySelector<HTMLElement>('.js-issue-title, bdi.js-issue-title');
  if (titleEl?.textContent) return titleEl.textContent.trim();

  const meta = doc.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-issue_title"]');
  if (meta?.content) return meta.content;

  return doc.title.replace(/\s*·.*$/, '').trim();
}

function scrapeAuthor(doc: Document): string {
  const authorLink = doc.querySelector<HTMLAnchorElement>(
    '.pull-header-username, a.author.Link--primary',
  );
  if (authorLink?.textContent) return authorLink.textContent.trim();

  const meta = doc.querySelector<HTMLMetaElement>('meta[name="octolytics-actor-login"]');
  if (meta?.content) return meta.content;

  return '';
}

function scrapeBranches(doc: Document): { head: string; base: string } {
  const base =
    doc.querySelector<HTMLElement>('.base-ref, span.base-ref .css-truncate-target')?.textContent ??
    '';
  const head =
    doc.querySelector<HTMLElement>('.head-ref, span.head-ref .css-truncate-target')?.textContent ??
    '';
  return { head: head.trim(), base: base.trim() };
}

function scrapeDescription(doc: Document): string {
  const bodyEl = doc.querySelector<HTMLElement>(
    '.comment-body.markdown-body, [data-testid="comment-body"]',
  );
  if (!bodyEl) return '';
  return (bodyEl.textContent ?? '').trim();
}
