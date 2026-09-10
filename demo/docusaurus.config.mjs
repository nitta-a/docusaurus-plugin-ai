import aiPlugin from 'docusaurus-plugin-ai/plugin';
import { themes as prismThemes } from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Docusaurus Plugin AI Demo',
  tagline: 'Local documentation Q&A without credentials',
  favicon: 'img/favicon.ico',
  url: 'http://localhost:3000',
  baseUrl: '/',
  organizationName: 'example',
  projectName: 'docusaurus-plugin-ai-demo',
  onBrokenLinks: 'throw',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.mjs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      },
    ],
  ],
  plugins: [
    [
      aiPlugin,
      {
        docsDir: 'docs',
        routePath: '/ai',
      },
    ],
  ],
  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'Plugin AI Demo',
      items: [
        { type: 'docSidebar', sidebarId: 'tutorialSidebar', label: 'Docs' },
        { to: '/ai', label: 'Ask AI', position: 'right' },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  },
};

export default config;
