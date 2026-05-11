import { isPrPage, scrapePr } from '../pr-scraper';
import { buildConductorUrl } from '../conductor-url';
import { createStorage } from '../storage';
import type { Preset, Settings } from '../types';

const WIDGET_ID = 'conductor-pr-widget';
const BUTTON_ID = 'conductor-pr-button';
const INJECTED_ATTR = 'data-conductor-injected';

const storage = createStorage();
let currentSettings: Settings | null = null;

void (async () => {
  currentSettings = await storage.getSettings();
  storage.onChange((s) => {
    currentSettings = s;
    // Re-render so the widget label reflects the latest default preset name.
    document.getElementById(WIDGET_ID)?.remove();
    tryInject();
  });
  setupNavigationListeners();
  setupMessageListener();
  tryInject();
})();

/**
 * Handle messages from the toolbar popup, which sends a `presetId` to trigger
 * that specific preset on the current tab.
 */
function setupMessageListener(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    if (!isOpenMessage(msg)) return;
    void runPreset(msg.presetId).then(
      (result) => sendResponse(result),
      (err: unknown) => sendResponse({ ok: false, reason: String(err) }),
    );
    return true; // keep the sendResponse channel open for async work
  });
}

interface OpenMessage {
  type: 'conductor:open';
  presetId: string;
}

function isOpenMessage(msg: unknown): msg is OpenMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'conductor:open' &&
    typeof (msg as { presetId?: unknown }).presetId === 'string'
  );
}

async function runPreset(presetId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const settings = currentSettings ?? (await storage.getSettings());
  const preset = settings.presets.find((p) => p.id === presetId);
  if (!preset) return { ok: false, reason: `Preset not found: ${presetId}` };

  const result = scrapePr(document, window.location);
  if (!result.ok) return { ok: false, reason: result.reason };

  const url = buildConductorUrl(settings.urlConfig, preset.template, result.metadata);
  openConductor(url);
  return { ok: true };
}

function setupNavigationListeners(): void {
  // GitHub uses Turbo for client-side navigation. These events cover both the
  // legacy PJAX and the newer Turbo Drive transitions.
  for (const event of ['turbo:render', 'turbo:load', 'pjax:end']) {
    document.addEventListener(event, () => tryInject());
  }

  // GitHub's PR sidebar mounts asynchronously after the initial document
  // render. We watch the whole body so any time the sidebar (re)appears we
  // try injecting again. The injection itself is idempotent — if the widget
  // is already present, tryInject() returns early.
  const observer = new MutationObserver(() => {
    if (!document.getElementById(WIDGET_ID)) tryInject();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function tryInject(): void {
  if (!isPrPage(window.location)) return;
  if (document.getElementById(WIDGET_ID)) return;

  const placement = findPlacement();
  if (!placement) return;

  const widget = createWidget();
  placement.parent.insertBefore(widget, placement.before);
}

interface Placement {
  parent: Element;
  /** Element to insert *before*. `null` means append as last child. */
  before: Element | null;
}

/**
 * Find where to insert the Conductor widget.
 *
 * Preferred location: directly above the Reviewers section in the PR's right
 * sidebar (`#reviewers-select-menu`). We fall back to the top of the sidebar,
 * then to the PR header — so the button stays visible across GitHub
 * redesigns and across the PR conversation/files/commits tabs.
 *
 * Selectors are taken from the patterns Refined GitHub uses
 * (`#partial-discussion-sidebar`, `#reviewers-select-menu`), which have been
 * stable for years because they come from server-side Rails partials.
 */
function findPlacement(): Placement | null {
  // 1. Best: insert above the Reviewers section
  const reviewers = document.querySelector('#reviewers-select-menu');
  if (reviewers?.parentElement) {
    return { parent: reviewers.parentElement, before: reviewers };
  }

  // 2. Next best: prepend to the sidebar so it's still in the right column
  const sidebar = document.querySelector('#partial-discussion-sidebar');
  if (sidebar) {
    return { parent: sidebar, before: sidebar.firstElementChild };
  }

  // 3. Fallback: next to the PR header actions
  const headerActions = document.querySelector(
    '.gh-header-actions, [data-testid="pr-header-actions"]',
  );
  if (headerActions) {
    return { parent: headerActions, before: headerActions.firstElementChild };
  }

  return null;
}

/**
 * Build the sidebar widget — styled like a native GitHub `discussion-sidebar-item`.
 *
 * Layout:
 *   ┌─────────────────────────────┐
 *   │ Conductor                   │   ← heading (matches native sidebar)
 *   ├─────────────────────────────┤
 *   │ [▶ Conductor: Review PR  ⌄] │   ← primary button + preset dropdown
 *   └─────────────────────────────┘
 */
function createWidget(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.id = WIDGET_ID;
  wrapper.className = 'conductor-widget discussion-sidebar-item';
  wrapper.setAttribute(INJECTED_ATTR, 'true');

  const heading = document.createElement('h3');
  heading.className = 'conductor-widget-heading discussion-sidebar-heading';
  heading.textContent = 'Conductor';
  wrapper.appendChild(heading);

  const row = document.createElement('div');
  row.className = 'conductor-widget-row';
  wrapper.appendChild(row);

  row.appendChild(createPrimaryButton());
  if (currentSettings && currentSettings.presets.length > 1) {
    row.appendChild(createPresetSelect());
  }

  return wrapper;
}

function createPrimaryButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.className = 'conductor-pr-button';
  button.title = 'Open this PR in a new Conductor workspace';

  const icon = document.createElement('span');
  icon.className = 'conductor-pr-button-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '▶';
  button.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'conductor-pr-button-label';
  const presetName = currentSettings ? getDefaultPreset(currentSettings)?.name : null;
  label.textContent = presetName ? `Conductor: ${presetName}` : 'Open in Conductor';
  button.appendChild(label);

  button.addEventListener('click', (event) => {
    event.preventDefault();
    void handleClick(button);
  });

  return button;
}

/**
 * Dropdown listing every configured preset (visible when there are 2+).
 *
 * Choosing a preset from the dropdown immediately fires that preset and
 * resets the select to its first option, so the dropdown acts as a one-shot
 * launcher rather than a persistent selector.
 */
function createPresetSelect(): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'conductor-preset-select';
  select.title = 'Pick a different preset';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '⌄';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  if (currentSettings) {
    for (const preset of currentSettings.presets) {
      const opt = document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.name;
      select.appendChild(opt);
    }
  }

  select.addEventListener('change', () => {
    const presetId = select.value;
    select.selectedIndex = 0;
    if (!presetId) return;
    void runPreset(presetId);
  });

  return select;
}

function getDefaultPreset(settings: Settings): Preset | undefined {
  return settings.presets.find((p) => p.id === settings.defaultPresetId) ?? settings.presets[0];
}

async function handleClick(button: HTMLButtonElement): Promise<void> {
  const settings = currentSettings ?? (await storage.getSettings());
  const preset = getDefaultPreset(settings);
  if (!preset) {
    flashButton(button, 'No preset configured');
    return;
  }

  const result = scrapePr(document, window.location);
  if (!result.ok) {
    flashButton(button, result.reason);
    return;
  }

  const url = buildConductorUrl(settings.urlConfig, preset.template, result.metadata);
  openConductor(url);
  flashButton(button, 'Opened in Conductor');
}

/**
 * Trigger a `conductor://` URL without navigating the host page.
 *
 * We append a hidden iframe rather than setting window.location, so if the
 * scheme isn't handled the user doesn't get bounced to an error page. macOS
 * routes the URL to Conductor.app via LaunchServices.
 */
function openConductor(url: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), 1000);
}

function flashButton(button: HTMLButtonElement, message: string): void {
  const original = button.lastChild?.textContent ?? 'Open in Conductor';
  if (button.lastChild) button.lastChild.textContent = message;
  button.classList.add('conductor-pr-button--flash');
  setTimeout(() => {
    if (button.lastChild) button.lastChild.textContent = original;
    button.classList.remove('conductor-pr-button--flash');
  }, 1500);
}
