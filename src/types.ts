/**
 * Placeholders available in prompt templates.
 *
 * Keep this list in sync with `pr-scraper.ts`. The values are extracted from
 * the GitHub PR page at click time and substituted into the template.
 */
export interface PRMetadata {
  /** Full URL of the PR, e.g. https://github.com/owner/repo/pull/123 */
  prUrl: string;
  /** PR number as a string, e.g. "123" */
  prNumber: string;
  /** PR title text */
  prTitle: string;
  /** PR description / body (markdown), empty string if not available */
  prDescription: string;
  /** Author login, e.g. "octocat" */
  prAuthor: string;
  /** Head branch (the branch being merged) */
  prBranch: string;
  /** Base branch (the branch being merged into) */
  prBaseBranch: string;
  /** "owner/repo" string */
  repo: string;
  /** Owner / organization */
  repoOwner: string;
  /** Repo name without the owner */
  repoName: string;
  /** URL to the diff (.diff suffix on the PR URL) */
  prDiffUrl: string;
  /** URL to the patch (.patch suffix on the PR URL) */
  prPatchUrl: string;
}

/** A configurable prompt preset shown in the popup / button. */
export interface Preset {
  /** Stable identifier (uuid-like string) */
  id: string;
  /** Display name shown on the button and in lists */
  name: string;
  /** Template string. Use {placeholder} syntax. See PRMetadata for keys. */
  template: string;
}

/**
 * URL template for the `conductor://` deep link.
 *
 * The default uses the format documented in the Conductor changelog (v0.36.4):
 * `conductor://` accepts `prompt` and `path` query parameters.
 *
 * Made configurable so power users can adapt without waiting on a release.
 */
export interface ConductorUrlConfig {
  /** Base URL template, e.g. "conductor://new?prompt={prompt}" */
  template: string;
}

/** Top-level settings object persisted to chrome.storage.sync. */
export interface Settings {
  presets: Preset[];
  /** Which preset is the "default" — clicked when the user hits the inline button. */
  defaultPresetId: string;
  urlConfig: ConductorUrlConfig;
}

/** Result of attempting to scrape the current page. */
export type ScrapeResult = { ok: true; metadata: PRMetadata } | { ok: false; reason: string };
