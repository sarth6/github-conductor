import { createStorage } from '../storage';
import { isPrPage } from '../pr-scraper';
import type { Preset, Settings } from '../types';

const storage = createStorage();

interface ActiveTabInfo {
  id: number;
  isPr: boolean;
}

async function init(): Promise<void> {
  const settings = await storage.getSettings();
  const tab = await getActiveTab();
  renderSubtitle(tab);
  renderPresets(settings, tab);

  document.getElementById('open-options')?.addEventListener('click', () => {
    if (chrome.runtime?.openOptionsPage) {
      void chrome.runtime.openOptionsPage();
    }
  });
}

async function getActiveTab(): Promise<ActiveTabInfo | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return null;
  try {
    const u = new URL(tab.url);
    return {
      id: tab.id,
      isPr: isPrPage({ hostname: u.hostname, pathname: u.pathname }),
    };
  } catch {
    return { id: tab.id, isPr: false };
  }
}

function renderSubtitle(tab: ActiveTabInfo | null): void {
  const el = document.getElementById('subtitle');
  if (!el) return;
  if (!tab?.isPr) {
    el.textContent = 'Open a GitHub PR to use a preset.';
    el.classList.add('error');
  } else {
    el.textContent = 'Pick a preset to open in Conductor.';
    el.classList.remove('error');
  }
}

function renderPresets(settings: Settings, tab: ActiveTabInfo | null): void {
  const list = document.getElementById('presets');
  if (!list) return;
  list.replaceChildren();
  for (const preset of settings.presets) {
    list.appendChild(renderPresetRow(preset, settings.defaultPresetId === preset.id, tab));
  }
}

function renderPresetRow(
  preset: Preset,
  isDefault: boolean,
  tab: ActiveTabInfo | null,
): HTMLElement {
  const li = document.createElement('li');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'preset-button';
  button.disabled = !tab?.isPr;

  const label = document.createElement('span');
  label.textContent = preset.name;
  button.appendChild(label);

  if (isDefault) {
    const badge = document.createElement('span');
    badge.className = 'preset-default-badge';
    badge.textContent = 'DEFAULT';
    button.appendChild(badge);
  }

  button.addEventListener('click', () => {
    if (!tab?.isPr) return;
    void trigger(tab.id, preset.id, button);
  });

  li.appendChild(button);
  return li;
}

async function trigger(tabId: number, presetId: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: 'conductor:open',
      presetId,
    })) as { ok: true } | { ok: false; reason: string } | undefined;

    if (response?.ok) {
      window.close();
    } else {
      const subtitle = document.getElementById('subtitle');
      if (subtitle) {
        subtitle.textContent = response?.reason ?? 'Failed to open Conductor.';
        subtitle.classList.add('error');
      }
    }
  } catch (err) {
    const subtitle = document.getElementById('subtitle');
    if (subtitle) {
      subtitle.textContent = `Error: ${String(err)}`;
      subtitle.classList.add('error');
    }
  } finally {
    button.disabled = false;
  }
}

void init();
