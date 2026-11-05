// docs/.vitepress/config.ts
import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'newrelic-transport',
  description: 'Drop-in HTTP request logging for Node.js that ships to New Relic Logs',
  base: '/newrelic-transport/', // must match the repo name
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'npm', link: 'https://www.npmjs.com/package/newrelic-transport' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Frameworks', link: '/guide/frameworks' },
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'What Gets Logged', link: '/guide/logged-attributes' },
          { text: 'Privacy & Redaction', link: '/guide/privacy' },
          { text: 'Reliability', link: '/guide/reliability' },
          { text: 'Troubleshooting & FAQ', link: '/guide/troubleshooting' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/manojchrsya/newrelic-transport' }],
    search: { provider: 'local' },
  },
});