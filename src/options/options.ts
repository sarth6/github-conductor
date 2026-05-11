import { createStorage, DEFAULT_SETTINGS, mergeWithDefaults } from '../storage';
import { VALID_PLACEHOLDERS } from '../template';
import { validateUrlTemplate } from '../conductor-url';
import type { Preset, Settings } from '../types';

const storage = createStorage();
let state: Settings = DEFAULT_SETTINGS;
let dirty = false;

const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

async function init(): Promise<void> {
  state = await storage.getSettings();
  bindStaticHandlers();
  renderPlaceholders();
  render();
}

function bindStaticHandlers(): void {
  $<HTMLInputElement>('#url-template').addEventListener('input', (e) => {
    state.urlConfig.template = (e.target as HTMLInputElement).value;
    validateAndRenderError();
    dirty = true;
  });

  $<HTMLButtonElement>('#add-preset').addEventListener('click', () => {
    const id = `preset-${Date.now()}`;
    state.presets.push({
      id,
      name: 'New preset',
      template: 'Open {prUrl}',
    });
    dirty = true;
    render();
  });

  $<HTMLButtonElement>('#save').addEventListener('click', () => void save());
  $<HTMLButtonElement>('#reset').addEventListener('click', () => {
    if (!window.confirm('Reset all settings to defaults? This removes your custom presets.')) {
      return;
    }
    state = mergeWithDefaults(undefined);
    dirty = true;
    render();
  });
}

function renderPlaceholders(): void {
  const container = $('#placeholders');
  container.replaceChildren();
  for (const name of VALID_PLACEHOLDERS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `{${name}}`;
    btn.title = 'Click to copy';
    btn.addEventListener('click', () => {
      void navigator.clipboard.writeText(`{${name}}`);
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = `{${name}}`;
      }, 800);
    });
    container.appendChild(btn);
  }
}

function render(): void {
  $<HTMLInputElement>('#url-template').value = state.urlConfig.template;
  validateAndRenderError();

  const presetsEl = $('#presets');
  presetsEl.replaceChildren();
  for (const preset of state.presets) {
    presetsEl.appendChild(renderPreset(preset));
  }
}

function renderPreset(preset: Preset): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'preset';

  const header = document.createElement('div');
  header.className = 'preset-header';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'preset-name';
  nameInput.value = preset.name;
  nameInput.placeholder = 'Preset name';
  nameInput.addEventListener('input', () => {
    preset.name = nameInput.value;
    dirty = true;
  });

  const defaultLabel = document.createElement('label');
  const defaultRadio = document.createElement('input');
  defaultRadio.type = 'radio';
  defaultRadio.name = 'default-preset';
  defaultRadio.checked = state.defaultPresetId === preset.id;
  defaultRadio.addEventListener('change', () => {
    if (defaultRadio.checked) {
      state.defaultPresetId = preset.id;
      dirty = true;
    }
  });
  defaultLabel.append(defaultRadio, document.createTextNode('default'));

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'preset-remove';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => {
    if (state.presets.length === 1) {
      window.alert('Keep at least one preset.');
      return;
    }
    state.presets = state.presets.filter((p) => p.id !== preset.id);
    if (state.defaultPresetId === preset.id) {
      state.defaultPresetId = state.presets[0]?.id ?? '';
    }
    dirty = true;
    render();
  });

  header.append(nameInput, defaultLabel, removeBtn);

  const templateInput = document.createElement('textarea');
  templateInput.className = 'preset-template';
  templateInput.value = preset.template;
  templateInput.placeholder = 'Prompt template — use {prTitle}, {prUrl}, etc.';
  templateInput.addEventListener('input', () => {
    preset.template = templateInput.value;
    dirty = true;
  });

  wrap.append(header, templateInput);
  return wrap;
}

function validateAndRenderError(): void {
  const error = validateUrlTemplate(state.urlConfig.template);
  const errorEl = $('#url-error');
  if (error) {
    errorEl.textContent = error;
    errorEl.hidden = false;
  } else {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

async function save(): Promise<void> {
  const error = validateUrlTemplate(state.urlConfig.template);
  if (error) {
    setStatus(`Cannot save: ${error}`, 'error');
    return;
  }
  if (state.presets.length === 0) {
    setStatus('Cannot save: at least one preset required.', 'error');
    return;
  }
  await storage.setSettings(state);
  dirty = false;
  setStatus('Saved.');
}

function setStatus(message: string, kind: 'ok' | 'error' = 'ok'): void {
  const el = $('#status');
  el.textContent = message;
  el.style.color = kind === 'error' ? 'var(--danger)' : 'var(--success)';
  setTimeout(() => {
    if (el.textContent === message) el.textContent = '';
  }, 2500);
}

window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

void init();
