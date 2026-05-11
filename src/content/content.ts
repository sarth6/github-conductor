import { isPrPage, scrapePr } from '../pr-scraper';
import { buildConductorUrl } from '../conductor-url';
import { createStorage } from '../storage';
import type { Preset, Settings } from '../types';

const BUTTON_ID = 'conductor-pr-button';
const INJECTED_ATTR = 'data-conductor-injected';

const storage = createStorage();
let currentSettings: Settings | null = null;

void (async () => {
  currentSettings = await storage.getSettings();
  storage.onChange((s) => {
    currentSettings = s;
    // Re-render so the button label reflects the latest default preset name.
    const existing = document.getElementById(BUTTON_ID);
    existing?.remove();
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

  // Fallback: a MutationObserver watching the header region. When GitHub
  // re-renders the PR header after navigation, we re-inject our button.
  const observer = new MutationObserver(() => {
    if (!document.getElementById(BUTTON_ID)) tryInject();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function tryInject(): void {
  if (!isPrPage(window.location)) return;
  if (document.getElementById(BUTTON_ID)) return;

  // Try several anchor points so we degrade gracefully across GitHub
  // redesigns. We insert next to the existing "Code" / "Subscribe" actions.
  const anchor = findAnchor();
  if (!anchor) return;

  const button = createButton();
  anchor.parentElement?.insertBefore(button, anchor);
}

function findAnchor(): Element | null {
  // Preferred: the right-side header actions container on the PR conversation page.
  const selectors = [
    '.gh-header-actions',
    '.gh-header-meta + div .gh-header-actions',
    '[data-testid="pr-header-actions"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      // Insert as a sibling at the start of the actions row.
      return el.firstElementChild ?? el;
    }
  }
  return null;
}

function createButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.className = 'conductor-pr-button btn btn-sm';
  button.setAttribute(INJECTED_ATTR, 'true');
  button.title = 'Open this PR in a new Conductor workspace';

  // Build the label with safe DOM construction (no innerHTML).
  const icon = document.createElement('span');
  icon.className = 'conductor-pr-button-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '▶'; // ▶
  button.appendChild(icon);

  const label = document.createElement('span');
  const presetName = currentSettings ? getDefaultPreset(currentSettings)?.name : null;
  label.textContent = presetName ? `Conductor: ${presetName}` : 'Open in Conductor';
  button.appendChild(label);

  button.addEventListener('click', (event) => {
    event.preventDefault();
    void handleClick(button);
  });

  return button;
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
