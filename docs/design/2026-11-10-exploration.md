# Cronkick design exploration

2026-11-10. Why the first redesign looks basic, what the good developer-tool sites do instead, and the proposed rebuild.

## What was looked at

**Live sites (full page, not just the hero):** Linear, Sentry Cron Monitoring, Depot, Trigger.dev, Inngest, Resend, crond.io.

**Mobbin, website sections:**
- Feature sections with product UI: [Cursor](https://mobbin.com/sites/sections/8fa0fbbb-f6a2-4a50-9b65-1e76bc2b31d8), [Resend](https://mobbin.com/sites/sections/78755cbd-afca-4d98-a8b9-ff6a7ef9179e), [GitBook](https://mobbin.com/sites/sections/fc0e216a-6d2c-48cb-ba2a-460ed678945d), [Stripe](https://mobbin.com/sites/sections/286613b2-cec3-4b45-ba6e-77930aa42ef4), [Retool](https://mobbin.com/sites/sections/4f9c3265-e166-44b3-a1cd-1fbeefa29d48)
- Closing calls to action: [Claude](https://mobbin.com/sites/sections/3ad59aee-0e6a-47e2-a84a-f6bda99a6702), [fal](https://mobbin.com/sites/sections/f51c042f-1fc6-4b62-a9ef-06ad11187090), [Bird](https://mobbin.com/sites/sections/cddb70d8-8531-4a78-991e-d472aeeb2d95)

**Mobbin, app screens:**
- Job and run dashboards: [Databricks job runs](https://mobbin.com/screens/c2906fac-d2b5-461d-a72a-0d01d690e233), [Sentry cron monitor](https://mobbin.com/screens/697759e1-fb82-4fae-9c5b-8a95fd368c85), [Modal function calls](https://mobbin.com/screens/8d4aae1f-56e1-474d-9151-2e2a59b6c262), [Cursor automation runs](https://mobbin.com/screens/9e304422-c051-4742-ab60-3029c0aed3b8), [Snowflake tasks](https://mobbin.com/screens/9c20b48a-7605-41fc-b000-c8ca4b18771e), [n8n executions](https://mobbin.com/screens/51188b77-28dd-4778-a525-a87676b3a299), [Better Stack heartbeat](https://mobbin.com/screens/2dfc6c4c-ac6c-406b-a5ca-aa8678e239d6)

## Why ours looks basic

| | Professional sites | Cronkick today |
|---|---|---|
| Product imagery | Real product UI, large: Linear's hero is the full app; Sentry shows its dashboard; Resend and Cursor show UI fragments | Abstract tick strips; the "how it works" visuals are small and toy-like |
| Feature sections | Framed cards, each holding a vignette of real UI (a Slack thread, terminal, webhook log, editor), with a caption below | A text-only grid |
| Depth | Layered panels (Linear puts a Slack thread over a kanban board), window chrome, light from the top, hairline gradient borders, faint grid or noise | Flat boxes on flat black |
| Rhythm | Each section is built differently: split heading and description, accordion plus screenshot, bento, wide table | Every section is eyebrow + heading + grid |
| Type scale | Section headings around 48–56px, with a description beside them (Linear) | 30–36px headings, so everything looks the same size |
| Trust details | Provider marks in buttons ("Sign in with GitHub"), language and integration logos, real numbers | No GitHub mark anywhere, though GitHub is the whole product |
| Ending | A big closing statement or a giant logo footer (fal) | A small call to action and a decorative strip |

## Proposed rebuild

1. **Header:** GitHub mark on Install; Docs link; the lockup.
2. **Hero:** headline and CTAs ("Install with GitHub" with the mark, plus the copy-the-line chip). Below them, a **large framed screenshot of the real dashboard** running off the right edge (as Linear does), with **floating panels layered on top**:
   - a "slot 03:00 · triggered +1.2 s · run #482 passed" event card;
   - the GitHub vs Cronkick strip comparison.
3. **The problem, with live data:** a wide chart from the probe repos: GitHub's scheduled runs this week, late and missing, by hour. Real numbers, not an example.
4. **Feature bento**, each card a UI vignette:
   - Every slot accounted for: a run table fragment with status icons;
   - No token: the GitHub App permission screen;
   - The schedule lives in your repo: an editor diff with a "synced on push" badge;
   - Never late, never twice: the slot lifecycle (due → triggered → accepted → passed / expired);
   - Alerts that matter: an email notification;
   - Safe to switch: a compatibility warning.
5. **Comparison table** with check and cross icons.
6. **Pricing:** two cards, with an annual toggle shown as text.
7. **FAQ.**
8. **Closing:** a large statement, and a giant lockup in the footer.

**Dashboard (Sentry and Databricks pattern):**
- **Workflow page:**
  - a runs bar chart by day, stacked as on time, late and missed;
  - a right rail with Schedule, Next run, Last run, Legend and Details;
  - status pills with icons;
  - filters.
- **Overview:** last 1 h / 24 h / 7 d mini stat cards, as in Cursor's automations.

**Craft rules:**
- An `AppFrame` component for product shots: a dark title bar with a tab and the URL.
- Gradient hairline borders (`white/10` to `white/5`), one radial glow per section at most, and a faint dot grid behind the hero only.
- Every visual is built from the real components, not a fake picture, so the marketing site shows exactly what the product looks like.
