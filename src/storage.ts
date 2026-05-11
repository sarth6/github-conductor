import type { Settings } from './types';

const STORAGE_KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  presets: [
    {
      id: 'review',
      name: 'Review PR',
      template: [
        'Please review this GitHub pull request and give a thorough code review.',
        '',
        'PR: {prUrl}',
        'Title: {prTitle}',
        'Author: @{prAuthor}',
        'Repo: {repo}',
        'Branch: {prBranch} → {prBaseBranch}',
        '',
        'Use `gh pr view {prNumber} --repo {repo}` and `gh pr diff {prNumber} --repo {repo}` to inspect the changes,',
        'then identify bugs, design issues, missing tests, and style problems.',
      ].join('\n'),
    },
    {
      id: 'address-comments',
      name: 'Address PR comments',
      template: [
        'Address all unresolved review comments on this PR.',
        '',
        'PR: {prUrl}',
        'Repo: {repo}',
        'Branch: {prBranch}',
        '',
        'Run `gh pr view {prNumber} --repo {repo} --comments` to read the comments,',
        'then check out the branch, fix each comment, and push.',
      ].join('\n'),
    },
  ],
  defaultPresetId: 'review',
  urlConfig: {
    // Default to the format Conductor's Linear integration uses (changelog v0.36.4).
    // The full prompt is passed in the `prompt` query param.
    template: 'conductor://new?prompt={prompt}',
  },
};

/**
 * Storage abstraction.
 *
 * Uses `chrome.storage.sync` so settings follow the user across devices. We
 * fall back to a non-persistent in-memory store when chrome APIs aren't
 * available — this keeps unit tests simple and lets the popup / options pages
 * be previewed in a plain browser tab.
 */
export interface StorageAdapter {
  getSettings(): Promise<Settings>;
  setSettings(settings: Settings): Promise<void>;
  onChange(listener: (settings: Settings) => void): () => void;
}

class ChromeStorageAdapter implements StorageAdapter {
  async getSettings(): Promise<Settings> {
    const raw = await chrome.storage.sync.get(STORAGE_KEY);
    const stored = raw[STORAGE_KEY] as Partial<Settings> | undefined;
    return mergeWithDefaults(stored);
  }

  async setSettings(settings: Settings): Promise<void> {
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
  }

  onChange(listener: (settings: Settings) => void): () => void {
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ): void => {
      if (areaName !== 'sync') return;
      const change = changes[STORAGE_KEY];
      if (!change) return;
      listener(mergeWithDefaults(change.newValue as Partial<Settings> | undefined));
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
}

/** Stand-in storage when chrome.storage isn't available (tests, plain browser preview). */
class MemoryStorageAdapter implements StorageAdapter {
  private settings: Settings = DEFAULT_SETTINGS;
  private listeners = new Set<(settings: Settings) => void>();

  async getSettings(): Promise<Settings> {
    return this.settings;
  }

  async setSettings(settings: Settings): Promise<void> {
    this.settings = settings;
    this.listeners.forEach((l) => l(settings));
  }

  onChange(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * Merge any partial stored settings with defaults so new fields added in
 * future versions are populated without wiping user data.
 */
export function mergeWithDefaults(stored: Partial<Settings> | undefined): Settings {
  if (!stored) return structuredClone(DEFAULT_SETTINGS);
  return {
    presets: stored.presets ?? DEFAULT_SETTINGS.presets,
    defaultPresetId: stored.defaultPresetId ?? DEFAULT_SETTINGS.defaultPresetId,
    urlConfig: {
      template: stored.urlConfig?.template ?? DEFAULT_SETTINGS.urlConfig.template,
    },
  };
}

export function createStorage(): StorageAdapter {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    return new ChromeStorageAdapter();
  }
  return new MemoryStorageAdapter();
}

export { ChromeStorageAdapter, MemoryStorageAdapter };
