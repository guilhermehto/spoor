import { defineConfig } from "vitepress";

export default defineConfig({
  base: "/spoor/",
  title: "Spoor",
  description: "Self-hosted, cookieless web analytics",
  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/spoor/favicon.svg" }]],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Reference", link: "/reference/configuration" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Deployment", link: "/guide/deployment" },
          { text: "Tracking Snippet", link: "/guide/tracking" },
          { text: "Dashboard", link: "/guide/dashboard" },
        ],
      },
      {
        text: "Reference",
        items: [{ text: "Configuration", link: "/reference/configuration" }],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/guilhermehto/spoor" }],
    search: { provider: "local" },
  },
});
