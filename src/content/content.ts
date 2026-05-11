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
 * Layout (heading owns "Conductor", button shows just the preset name):
 *
 *   ┌─ Conductor ──── ⚙ ─┐
 *   │ ┌───────────┬─┐    │
 *   │ │ 🚂 Review │⌄│    │
 *   │ └───────────┴─┘    │
 *   └────────────────────┘
 */
function createWidget(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.id = WIDGET_ID;
  wrapper.className = 'conductor-widget discussion-sidebar-item';
  wrapper.setAttribute(INJECTED_ATTR, 'true');

  wrapper.appendChild(createHeading());
  wrapper.appendChild(createSplitButton());

  return wrapper;
}

function createHeading(): HTMLElement {
  const heading = document.createElement('div');
  heading.className = 'conductor-widget-heading discussion-sidebar-heading';

  const label = document.createElement('span');
  label.textContent = 'Conductor';
  heading.appendChild(label);

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'conductor-settings-link';
  settings.title = 'Manage presets…';
  settings.setAttribute('aria-label', 'Manage Conductor presets');
  settings.appendChild(createSvgIcon('gear'));
  settings.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      void chrome.runtime.openOptionsPage();
    }
  });
  heading.appendChild(settings);

  return heading;
}

/**
 * GitHub-style split button. The wide left half fires the default preset.
 * The narrow caret toggles a popover listing every other preset.
 */
function createSplitButton(): HTMLElement {
  const group = document.createElement('div');
  group.className = 'conductor-split';

  const primary = document.createElement('button');
  primary.id = BUTTON_ID;
  primary.type = 'button';
  primary.className = 'conductor-primary';
  primary.title = 'Open this PR in a new Conductor workspace';

  primary.appendChild(createSvgIcon('train'));

  const label = document.createElement('span');
  label.className = 'conductor-primary-label';
  const presetName = currentSettings ? getDefaultPreset(currentSettings)?.name : null;
  label.textContent = presetName ?? 'Open in Conductor';
  primary.appendChild(label);

  primary.addEventListener('click', (event) => {
    event.preventDefault();
    void handleClick(primary);
  });

  group.appendChild(primary);

  // Show the caret + popover only when there are 2+ presets to switch between.
  if (currentSettings && currentSettings.presets.length > 1) {
    group.appendChild(createPresetMenu());
  }

  return group;
}

function createPresetMenu(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'conductor-menu';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'conductor-caret';
  trigger.title = 'Pick a different preset';
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', 'Pick a different preset');
  trigger.appendChild(createSvgIcon('caret'));

  const list = document.createElement('div');
  list.className = 'conductor-menu-list';
  list.setAttribute('role', 'menu');
  list.hidden = true;

  if (currentSettings) {
    for (const preset of currentSettings.presets) {
      list.appendChild(createPresetMenuItem(preset, list, trigger));
    }
  }

  const closeMenu = (): void => {
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = !list.hidden;
    if (isOpen) {
      closeMenu();
    } else {
      list.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    }
  });

  // Close on outside click + Escape — matches GitHub's own menu behavior.
  document.addEventListener('click', (event) => {
    if (list.hidden) return;
    if (!wrap.contains(event.target as Node)) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !list.hidden) closeMenu();
  });

  wrap.appendChild(trigger);
  wrap.appendChild(list);
  return wrap;
}

function createPresetMenuItem(
  preset: Preset,
  list: HTMLElement,
  trigger: HTMLButtonElement,
): HTMLElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'conductor-menu-item';
  item.setAttribute('role', 'menuitem');
  item.textContent = preset.name;
  if (currentSettings?.defaultPresetId === preset.id) {
    item.classList.add('conductor-menu-item--default');
    const badge = document.createElement('span');
    badge.className = 'conductor-menu-item-badge';
    badge.textContent = 'default';
    item.appendChild(badge);
  }
  item.addEventListener('click', () => {
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    void runPreset(preset.id);
  });
  return item;
}

/**
 * Build a small SVG icon by name. Inline SVG (vs. icon font / image asset)
 * means the icon inherits `currentColor` and scales perfectly at any DPR.
 */
function createSvgIcon(name: 'train' | 'caret' | 'gear'): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('conductor-icon', `conductor-icon--${name}`);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  switch (name) {
    case 'train':
      // Simplified locomotive: cab + boiler + two wheels + smokestack puff.
      path.setAttribute(
        'd',
        'M3 2.75A.75.75 0 0 1 3.75 2h7.5a.75.75 0 0 1 .75.75V4h.75A1.75 1.75 0 0 1 14.5 5.75v3.5A1.75 1.75 0 0 1 12.75 11H12a2 2 0 1 1-4 0H7a2 2 0 1 1-4 0H2.75A.75.75 0 0 1 2 10.25V3.5h1Zm.5 1.25v2h3.75V4H3.5Zm5.25 0v2H11V4H8.75ZM5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
      );
      break;
    case 'caret':
      path.setAttribute(
        'd',
        'M4.427 7.427a.6.6 0 0 1 .848 0L8 10.15l2.725-2.725a.6.6 0 1 1 .848.848l-3.15 3.15a.6.6 0 0 1-.848 0l-3.15-3.15a.6.6 0 0 1 .002-.848Z',
      );
      break;
    case 'gear':
      path.setAttribute(
        'd',
        'M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224c.231.114.454.243.668.386c.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63a8 8 0 0 1 .812 1.402c.215.59 0 1.184-.483 1.612l-.7.616c-.06.054-.116.165-.111.339a5 5 0 0 1 0 .886c-.005.174.051.286.111.339l.7.616c.483.428.698 1.022.483 1.612a8 8 0 0 1-.811 1.403c-.43.608-1.176.806-1.821.63l-1.103-.303c-.066-.018-.176-.011-.299.071a5 5 0 0 1-.668.386c-.133.066-.194.158-.212.224l-.288 1.107c-.171.643-.717 1.194-1.46 1.259a9 9 0 0 1-1.402 0c-.743-.065-1.289-.616-1.46-1.259l-.288-1.107c-.018-.066-.079-.158-.212-.224a5 5 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8 8 0 0 1-.811-1.402c-.216-.59 0-1.185.482-1.613l.7-.616c.06-.053.116-.165.111-.339a5 5 0 0 1 0-.886c.005-.174-.051-.286-.111-.339l-.7-.616c-.483-.428-.698-1.022-.483-1.612a8 8 0 0 1 .812-1.402c.428-.609 1.176-.807 1.82-.63l1.103.303c.066.018.176.011.299-.071c.214-.143.437-.272.668-.386c.133-.066.194-.158.212-.224L5.839 1.29C6.01.645 6.557.095 7.299.03A8 8 0 0 1 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189c-.173.086-.34.183-.5.29c-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045a7 7 0 0 0-.682 1.181c-.02.045.001.108.044.146l.7.617c.42.37.604.913.583 1.413a4 4 0 0 0 0 .666c.02.5-.163 1.043-.583 1.413l-.7.617c-.044.038-.064.101-.044.146c.183.43.41.83.682 1.181c.02.029.086.076.195.045l1.103-.303c.56-.153 1.112-.008 1.529.27c.16.107.327.204.5.29c.449.222.85.629.998 1.189l.289 1.105c.029.109.101.143.137.146a7 7 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189c.173-.086.34-.183.5-.29c.417-.278.97-.423 1.529-.27l1.103.303c.109.03.175-.016.195-.045c.272-.35.499-.747.682-1.181c.02-.045-.001-.108-.044-.146l-.7-.617c-.42-.37-.604-.913-.583-1.413a4 4 0 0 0 0-.666c-.02-.5.163-1.043.583-1.413l.7-.617c.044-.038.064-.101.044-.146a7 7 0 0 0-.682-1.181c-.02-.029-.086-.076-.195-.045l-1.103.303c-.56.153-1.112.008-1.529-.27a4 4 0 0 0-.5-.29c-.449-.222-.85-.629-.998-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a7 7 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0a3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3 0a1.5 1.5 0 0 0 3 0Z',
      );
      break;
  }
  svg.appendChild(path);
  return svg;
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

/**
 * Briefly mutate the button to show a transient status (success or error)
 * without losing the original label. We update the label span only — the
 * SVG icon stays put.
 */
function flashButton(button: HTMLButtonElement, message: string): void {
  const labelEl = button.querySelector<HTMLElement>('.conductor-primary-label');
  const original = labelEl?.textContent ?? '';
  if (labelEl) labelEl.textContent = message;
  button.classList.add('conductor-primary--flash');
  setTimeout(() => {
    if (labelEl) labelEl.textContent = original;
    button.classList.remove('conductor-primary--flash');
  }, 1500);
}
