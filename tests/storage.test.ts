import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MemoryStorageAdapter, mergeWithDefaults } from '../src/storage';

describe('mergeWithDefaults', () => {
  it('returns defaults when nothing is stored', () => {
    expect(mergeWithDefaults(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('preserves stored fields and fills missing ones', () => {
    const merged = mergeWithDefaults({
      defaultPresetId: 'custom',
    });
    expect(merged.defaultPresetId).toBe('custom');
    expect(merged.presets).toEqual(DEFAULT_SETTINGS.presets);
    expect(merged.urlConfig).toEqual(DEFAULT_SETTINGS.urlConfig);
  });

  it('fills missing urlConfig.template', () => {
    // @ts-expect-error -- intentionally partial
    const merged = mergeWithDefaults({ urlConfig: {} });
    expect(merged.urlConfig.template).toBe(DEFAULT_SETTINGS.urlConfig.template);
  });

  it('migrates known-broken URL templates to the working default', () => {
    for (const broken of [
      'conductor://new?prompt={prompt}',
      'conductor://?prompt={prompt}',
      'conductor://open?prompt={prompt}',
      'conductor://workspace?prompt={prompt}',
    ]) {
      const merged = mergeWithDefaults({ urlConfig: { template: broken } });
      expect(merged.urlConfig.template).toBe('conductor://prompt={prompt}');
    }
  });

  it('preserves a custom URL template that is not on the known-broken list', () => {
    const custom = 'conductor://prompt={prompt}&path=/Users/me/code/{repoName}';
    const merged = mergeWithDefaults({ urlConfig: { template: custom } });
    expect(merged.urlConfig.template).toBe(custom);
  });

  it('returns a deep clone so callers cannot mutate defaults', () => {
    const a = mergeWithDefaults(undefined);
    const b = mergeWithDefaults(undefined);
    a.presets.push({ id: 'x', name: 'x', template: 'x' });
    expect(b.presets).toHaveLength(DEFAULT_SETTINGS.presets.length);
  });
});

describe('MemoryStorageAdapter', () => {
  it('round-trips settings', async () => {
    const store = new MemoryStorageAdapter();
    const next = { ...DEFAULT_SETTINGS, defaultPresetId: 'review' };
    await store.setSettings(next);
    expect(await store.getSettings()).toEqual(next);
  });

  it('notifies change listeners', async () => {
    const store = new MemoryStorageAdapter();
    let received: unknown = null;
    const unsub = store.onChange((s) => {
      received = s;
    });
    await store.setSettings({ ...DEFAULT_SETTINGS, defaultPresetId: 'updated' });
    expect((received as typeof DEFAULT_SETTINGS).defaultPresetId).toBe('updated');
    unsub();
  });

  it('stops notifying after unsubscribe', async () => {
    const store = new MemoryStorageAdapter();
    let calls = 0;
    const unsub = store.onChange(() => {
      calls++;
    });
    await store.setSettings(DEFAULT_SETTINGS);
    unsub();
    await store.setSettings(DEFAULT_SETTINGS);
    expect(calls).toBe(1);
  });
});
