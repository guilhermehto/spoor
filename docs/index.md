---
layout: home

hero:
  name: Spoor
  text: Self-hosted, cookieless web analytics
  tagline: Drop one script tag on any site; see page views, clicks, custom events, and session timelines in a private dashboard.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/guilhermehto/spoor

features:
  - title: Multi-project
    details: One Spoor instance tracks many sites, each with its own project and keys.
  - title: Cookieless visitor identity
    details: Visitors are identified by a daily-rotating HMAC hash — no cookies, no localStorage.
  - title: Drop-in snippet
    details: Auto page views (including SPA navigations), data-track click tracking, and custom events via window.spoor.track(name, props).
  - title: JS error tracking
    details: The snippet captures window error and unhandledrejection events alongside your analytics.
  - title: Private dashboard
    details: Time-series chart, top pages, top referrers, click/custom events table, and session list with journey timeline.
  - title: Single-admin posture
    details: Registration is open only while the users table is empty — first user in, door closed.
---
