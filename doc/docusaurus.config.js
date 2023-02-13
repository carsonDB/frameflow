// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'FrameFlow',
  tagline: 'Media stream processing library for JavaScript world',
  // favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://frameflow.netlify.app',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'carsonDB', // Usually your GitHub org/user name.
  projectName: 'frameflow', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/carsondb/frameflow/tree/main/doc/',
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/carsondb/frameflow/tree/main/doc/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      // image: 'img/docusaurus-social-card.jpg',
      navbar: {
        // title: 'My Site',
        logo: {
          alt: 'Home Logo',
          src: 'img/home_icon.png',
        },
        items: [
          {
            type: 'doc',
            docId: 'Introduction/getStarted',
            position: 'left',
            label: 'Docs',
          },
          {
            type: 'doc',
            docId: 'API/index',
            position: 'left',
            label: 'API',
          },
          {to: '/blog', label: 'Blog', position: 'left'},
          {
            href: 'https://github.com/carsonDB/frameflow',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              // {
              //   label: 'Tutorial',
              //   to: '/docs/intro',
              // },
            ],
          },
          // {
          //   title: 'Community',
          //   items: [
              // {
              //   label: 'Stack Overflow',
              //   href: 'https://stackoverflow.com/questions/tagged/docusaurus',
              // },
              // {
              //   label: 'Discord',
              //   href: 'https://discordapp.com/invite/docusaurus',
              // },
              // {
              //   label: 'Twitter',
              //   href: 'https://twitter.com/docusaurus',
              // },
            // ],
          // },
          {
            title: 'More',
            items: [
              {
                label: 'Blog',
                to: '/blog',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/carsonDB/frameflow',
              },
            ],
          },
        ],
        // copyright: `Copyright © ${new Date().getFullYear()} FrameFlow, Inc.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
    }),

    themes: ['@docusaurus/theme-live-codeblock'],

    plugins: [
      [
        'docusaurus-plugin-typedoc',
        // Plugin / TypeDoc options
        {
          entryPoints: ['../src/ts/main.ts'],
          tsconfig: '../tsconfig.json',
          out: 'API',
        },
      ],
    ]
};

module.exports = config;
