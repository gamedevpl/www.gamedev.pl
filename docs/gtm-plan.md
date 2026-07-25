# Go-to-market plan

Status: draft, 2026-07-25.

This is the plan for taking www.gamedev.pl from closed beta to a public, growing service — including growing the GitHub presence (stars, forks, followers) as a first-class goal. It assumes a marketing budget of roughly zero and takes seriously that the dominant cost is not marketing but COGS: every game creation is an expensive agent run, while every play is nearly free.

## Starting position

Assets:

1. **The gamedev.pl domain and its community history.** Real brand equity in Poland with exactly the audience that will understand the product first. This is the unfair distribution advantage — not social media reach.
2. **Every created game is a landing page.** A creator who shares their game does the marketing. The product has a built-in growth loop; the job is to remove friction from it, not to buy traffic.
3. **Party mode is physically viral.** One screen plus N phones means every session demos the product to N people who did nothing but scan a code.
4. **The platform repo is already open source** ([gamedevpl/www.gamedev.pl](https://github.com/gamedevpl/www.gamedev.pl), GPL-3.0) — but its metadata still describes the pre-rebirth static site.

Reach today: small X/Twitter account, some LinkedIn audience, the gamedev.pl name. GitHub: 7 stars, 22 forks (old-site era), org has 2 followers.

Structural constraint: **grow players faster than creators.** Players cost nothing and become creators later; creators cost money per prompt. Play spreads freely; creation stays gated (waitlist, invites, quotas) until unit economics allow otherwise.

## Mental model for GitHub growth

Stars come from developers having an "oh, that's cool" moment while looking at the repo, and they cluster around events — a repo earns most of its stars in a few spikes (HN front page, GitHub Trending, a viral post), not linearly. Therefore: (1) make the repo worth starring before any spike, (2) aim every launch moment at the repo too, (3) run slow-burn contribution loops in between. Followers are a lagging by-product; forks come from giving people a reason to run or extend the code.

**Never gate anything on starring** ("star to skip the waitlist"). Incentivized stars violate GitHub's inauthentic-activity rules, developers resent them, and they poison the metric. Soft asks only.

---

## Stage 0 — Private beta: prove retention (now, ~2–4 weeks)

Goal: know the numbers before inviting anyone we can't personally apologize to.

Product/metrics:

- Define activation metrics. Creators: _created a game and returned to play or revise it within 7 days._ Players: _played 3+ games in a session._ Use existing telemetry to answer: do creators return? Are post-play revisions actually used?
- Seed the catalog to ~30–50 genuinely fun games. An empty arcade kills the play-first funnel. Curate hard — the public catalog is the best work, not everything.
- Fix the first 60 seconds: land on the site → playing a good game with zero sign-in. Sign-in gates _creation_, never _play_.
- Establish unit economics: cost per created game, cost per revision cycle. This number decides how fast the gates open in Stage 2.

GitHub (repo hygiene week — one-time work, zero budget):

- **README as a landing page.** Top fold: one-sentence pitch ("describe a game, an AI agent builds it, play it in your browser — with friends, phones as controllers"), an animated GIF of prompt → agent working → playable game, link to the live site, architecture diagram below. Reused everywhere: HN, Reddit, LinkedIn.
- Fix metadata: description, homepage, topics (`ai-agents`, `game-development`, `typescript`, `multiplayer`, …), social-preview image (what renders when the link is shared).
- **The heritage story lives in this repo** — same repo that hosted the community site now hosts the AI platform. Short "History" section in the README. The 22 old-era forks are warm contacts: announce the rebirth as a Release + Discussion so old watchers get notified for free.
- Contribution surface: CONTRIBUTING.md, ~10 `good first issue` labels (i18n strings are the classic first-PR magnet for the Polish community), enable Discussions, pin the repo on the org profile.
- Cut weekly tagged releases with human-readable changelogs — recurring notifications to watchers, visible signs of life.
- License: keep GPL-3.0 for the platform (clone-hostile, contribution-friendly). MIT is reserved for extracted components (Stage 2).

**Gate to advance:** creator D7 return >20–30%, and cost-per-created-game is known with confidence.

---

## Stage 1 — The Polish beachhead (~4–8 weeks)

Goal: 500–2,000 engaged users from communities where we have standing; first organic creator-share loop; the repo joins every message.

- **Lead with the domain's story, carefully.** "The legendary gamedev.pl reborn: now everyone can make a game" is a strong Polish tech-press pitch — and "open-source rebirth" makes it stronger. Write it as _honoring_ the heritage ("this domain taught a generation to make games; now it lets anyone"), not replacing it. Consider a small history page. Prepare PL + EN versions.
- **Waitlist with invite codes.** Every activated user gets 3 invites. Scarcity does two jobs: word-of-mouth and a throttle on creation costs. This is the budget safety valve — never fully open registration while creation is expensive.
- **LinkedIn = build-in-public narrative.** Weekly founder-journey posts (costs, weird games users made, agent failures — honesty performs). Every post links the repo, not just the site: "and it's open source" changes who shares it. LinkedIn won't drive players at scale, but it produces press intros, partners, credibility.
- **X/Twitter = show, don't tell.** 30–60s screen captures: prompt → agent working → playable game. Post the games, not the platform.
- **Dev-blog posts as star bait**, one per 2–3 weeks, each ending at the repo. Unusually interesting internals to draw from: the agent creation pipeline with a QA gate, post-play feedback re-triggering the agent via PR comments, the sandboxed-iframe player bridge, the phone-controller relay for party mode.
- **Product ↔ repo links:** "open source" footer with a live star badge; on each game page a subtle "built by an AI agent — see how, on GitHub".
- **One live event.** Party mode at a Polish gamedev/tech meetup. One evening of people playing arena-tag on their phones creates more true fans than a month of posting.

**Gate to advance:** organic signups from shared game links exceed signups from our own posts.

---

## Stage 2 — Open the play side, meter the create side (~2–3 months)

Goal: game pages become the acquisition engine; creation converts from play; launch spikes are aimed at GitHub.

- **Every game page is a real landing page:** playable instantly, OG image, "Made with a prompt on gamedev.pl — make your own" CTA, creator attribution. Engineering work, not marketing spend; highest-ROI item in this stage.
- **Remix as the cheap on-ramp.** A remix (tweaking an existing game's prompt) is a smaller agent run than creation from scratch — cheaper for us, lower blank-page anxiety for the user.
- **SEO compounding:** indexable catalog pages ("free browser games", "party games to play on phones", Polish equivalents). The PWA work (installability, offline) supports this funnel.
- **Recurring prompt jam.** Weekly theme, winners featured on the homepage — a free content calendar, a retention hook, and a curation mechanism. Winners' games (with consent) go into a public showcase with the creator's name on github.com/gamedevpl; they share it, their followers arrive.
- **Staggered English launch moments,** each weeks apart so every cost spike is survivable and each gets its own GitHub Trending window:
  1. **Show HN** — the biggest single star event. Title mentions open source; first comment links the repo and explains the architecture honestly. A front page typically converts to a few hundred stars in 24–48h — enough for GitHub Trending (TypeScript, daily), which compounds for free.
  2. **Product Hunt.**
  3. Targeted subreddits (r/WebGames, r/incremental_games, r/playmygame).
     Before each: lower quotas, confirm the waitlist absorbs overflow. A launch spike that burns the monthly budget in a day is the main failure mode of this stage.
- **Give people a reason to fork.** Cheap: a "run it locally with your own API key" path in the README. Higher-leverage: extract one component as a standalone MIT package — strongest candidate is the **phone-as-controller party-mode kit** (relay + client), useful outside the product and unserved by existing libraries. A focused library can out-star the platform repo and funnels attention back; it also sidesteps the games-repo-must-stay-private constraint.
- **Submit to awesome-lists** (awesome-ai-agents, awesome-game-dev, and similar) — slow drip, permanent.

**Gate to advance:** stable share of players who try creating, retention holding, and a cost per activated creator we'd pay indefinitely.

---

## Stage 3 — Monetize and scale

- **Free to play forever; pay to create more.** Small free creation quota, then credit packs or a creator subscription, priced from real per-game cost with margin. Remixes cheaper than creations in credits too.
- Watch for B2B pull (don't build ahead of it): party mode for team events / education — the LinkedIn audience is the natural channel.
- Only now consider paid acquisition, and only into the _play_ funnel with proven conversion behind it.
- GitHub steady state: Hacktoberfest (October) with prepared issues if the contributor funnel proved itself; meetup/conference talks ("we let an AI agent ship games to production behind a QA gate") each ending on the repo URL; the MIT component(s) as permanent top-of-funnel.

---

## Metrics

- **Product:** creator D7 return, players-per-session, share of players who try creating, cost per created game / per activated creator, signups from shared game links vs. own posts.
- **GitHub:** star _velocity around events_ (Insights → Traffic shows which post converts), unique cloners, first-time contributors per month. Ignore absolute follower counts in Stages 0–1; org followers lag repo activity by a long way.

## Anti-goals

- No paid ads before Stage 3 — that pays to acquire users into an unproven funnel while each creator also costs inference money.
- No simultaneous PH + HN + Reddit launch — the correlated cost spike is unaffordable and staggered spikes teach more.
- No running TikTok/Shorts as an owned channel — instead make sharing so easy creators post their own games there.
- No fully open registration "because growth" — the invite gate is the cost control.
- No incentivized stars, ever.

## First-week checklist

1. Write down the activation metrics and check them against existing telemetry.
2. Audit the anonymous first-play flow — remove every click between landing and playing.
3. Start the seed-catalog push toward 30–50 curated games.
4. Draft the "gamedev.pl reborn" story (PL + EN).
5. Ship invite codes for beta users (waitlist/access-list infra mostly exists).
6. README overhaul + demo GIF + social-preview image.
7. Fix repo description/topics/homepage, pin the repo, enable Discussions.
8. Post the rebirth announcement as a Release + Discussion (notifies old-era watchers for free).
9. Label ~10 good-first-issues, i18n-heavy.
10. Add the footer star badge to the site.
11. Post one prompt→game video on X and one build-in-public post on LinkedIn as a baseline — measure, don't judge, the first ones.

## One-sentence version

Use the gamedev.pl name to win Poland first; let shared game pages, party mode, and an honest open-source story do the marketing; keep creation invite-gated until the numbers prove each new creator is affordable — then charge for exactly the thing that costs money.
