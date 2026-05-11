import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from '../package.json' with { type: 'json' };

const { version, description } = packageJson;

export default defineManifest({
  manifest_version: 3,
  name: 'GitHub Conductor',
  short_name: 'GH Conductor',
  description,
  version,
  icons: {
    16: 'icons/icon-16.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/popup.html',
    default_title: 'Open in Conductor',
    default_icon: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  options_page: 'src/options/options.html',
  permissions: ['storage'],
  host_permissions: ['*://github.com/*'],
  content_scripts: [
    {
      matches: ['*://github.com/*'],
      js: ['src/content/content.ts'],
      css: ['src/content/content.css'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['icons/*.png'],
      matches: ['*://github.com/*'],
    },
  ],
});
