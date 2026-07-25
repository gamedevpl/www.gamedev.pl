# Go-to-market plan

Status: v3, 2026-07-25. v2 followed a competitive review of open-source built-in-public products; v3 corrects it for a hard constraint — there is no self-hostable game generator and none is planned, so the repo's audience for _running_ the code is contributors only.

This is the plan for taking www.gamedev.pl from closed beta to a public, growing service — including growing the GitHub presence (stars, forks, followers) as a first-class goal. It assumes a marketing budget of roughly zero and takes seriously that the dominant cost is not marketing but COGS: every game creation is an expensive agent run, while every play is nearly free.

## Starting position

Assets:

1. **The gamedev.pl domain and its community history.** Real brand equity in Poland with exactly the audience that will understand the product first. This is the unfair distribution advantage — not social media reach.
2. **Every created game is a landing page.** A creator who shares their game does the marketing. The product has a built-in growth loop; the job is to remove friction from it, not to buy traffic.
3. **Party mode is physically viral.** One screen plus N phones means every session demos the product to N people who did nothing but scan a code.
4. **The platform repo is already open source** ([gamedevpl/www.gamedev.pl](https://github.com/gamedevpl/www.gamedev.pl), GPL-3.0) — but its metadata still describes the pre-rebirth static site.
5. **The product is substantially built and operated by AI agents** — creation pipeline, QA gate, feedback loops through PR comments. The repo is a live documentary of a thing most developers have only read think-pieces about. This is a marketing asset, not just an implementation detail.

Reach today: small X/Twitter account, some LinkedIn audience, the gamedev.pl name. GitHub: 7 stars, 22 forks (old-site era), org has 2 followers.

Structural constraint: **grow players faster than creators.** Players cost nothing and become creators later; creators cost money per prompt. Play spreads freely; creation stays gated (waitlist, invites, quotas) until unit economics allow otherwise.

## Positioning

Two positioning laws, learned from every comparable repo that broke 15k stars:

1. **Be runnable, or be an alternative to something famous — ideally both.** Repos of hosted products that can't be self-run don't earn stars, no matter how clean the code.
2. **The category "AI builds software from a prompt" is in its gold-rush window right now**, and nobody has claimed the games corner of it.

**A hard constraint shapes how we can play these laws:** there is no self-hostable game generator, and none is planned — self-hosted agent execution was removed for legal reasons and is not a future phase (AGENTS.md). The only people who will ever run this stack are contributors to gamedev.pl itself. So the "utility" star lever is mostly unavailable, and the strategy leans on the other three reasons people star — **reference** (I can learn from this), **story** (I want to follow this), **identity** (this is my community's place) — with runnability rescoped to _contributor experience_. This is the lichess path (mission + community + story), accelerated by the AI-category tailwind, not the dyad path (clone-and-run).

Therefore:

- **Repo one-liner:** "The open-source AI game maker behind www.gamedev.pl — describe a game, an AI agent builds it, everyone plays it in the browser. Watch an AI dev team ship in public." Name the famous closed products (Rosebud AI, Websim) in the README body, honestly: the source is open, the hosted service is how you use it.
- **Mission statement** for the heritage story: _the forever free place where anyone can make a game._ The domain taught a generation of Poles to make games; now it lets anyone. Honor, don't replace.

**Never gate anything on starring** ("star to skip the waitlist"). Incentivized stars violate GitHub's inauthentic-activity rules, developers resent them, and they poison the metric. Soft asks only.

Expectation calibration, updated for the constraint: the clone-and-run cohort's 20k-in-a-year curve is out of reach. The honest reference points are mission-driven platforms (lichess: ~18k over 14 years) and story-driven build-in-public (~9k over 3 years without a category tailwind). With the AI tailwind and the story executed well, low-thousands in year one is a good outcome and worth having; the compounding assets (watchers, contributors, community identity) matter more than the count.

---

## Stage 0 — Private beta: prove retention, build the conversion machine (now, ~2–4 weeks)

Goal: know the numbers before inviting anyone we can't personally apologize to — and pass the stranger test: _a developer landing on the repo with no context finds something to run, something to read, and something to watch._ Today the answer is no, three times.

Product/metrics:

- Define activation metrics. Creators: _created a game and returned to play or revise it within 7 days._ Players: _played 3+ games in a session._ Use existing telemetry to answer: do creators return? Are post-play revisions actually used?
- Seed the catalog to ~30–50 genuinely fun games. An empty arcade kills the play-first funnel. Curate hard.
- Fix the first 60 seconds: land on the site → playing a good game with zero sign-in. Sign-in gates _creation_, never _play_.
- Establish unit economics: cost per created game, cost per revision cycle. This number decides how fast the gates open in Stage 2.

### Something to run — the five-minute contributor loop

The stack already boots with zero cloud config (`npm install && npm run dev`: in-memory store, mock provider, no keys). But a first-time contributor's first five minutes are an empty arcade with a red catalog error and a sign-in they can't complete. Three small changes close the gap, and every seam already exists in the code:

- **Bundled fixture catalog:** 2–3 owner-authored seed games (arena-tag, tactics-duel, …) served when the games-repo env is unset — lights up the arcade, theater, and party mode fully offline. User games stay private; the boundary doesn't move.
- **Dev-only sign-in:** a non-prod button that mints a session (the auth layer already special-cases dev; the token-minting recipe already exists in tests).
- **Mocked games-repo client:** the create flow exercises the issue lifecycle locally without the private repo or a PAT.
- `.env.example` documenting that every var is optional in dev.

The goal is not self-hosting — it's that a potential contributor experiences the whole product loop before their coffee cools, because contributors are the only audience who will ever run this stack.

### Something to read — the engineering notebook

`docs/` is already an unusual asset (architecture, security model, QA plans, this file). Give it an index and a framing paragraph telling visitors it is meant to be read. Add one deep-dive that doubles as a market test: how the phone-controller relay works — if it draws attention, it graduates to a standalone package in Stage 2.

### Something to watch — an AI team shipping a product in public

Make the agent-built nature visible instead of incidental: a README section ("this product is largely built by AI agents — here's how, and where to watch"), agent-authored PRs left readable rather than squashed into opacity, and a pinned Discussion narrating the week — what the agents shipped, where they failed. Watching is the interaction that compounds: watchers get notified about everything afterward.

### GitHub as the beta's front door

Route beta feedback energy to the repo — it is the only authentic interaction generator available in a private beta:

- **Two-lane problem reporting.** Lane 1, in-product: low-friction, private by default, every report carries a correlation ID tied to telemetry so logs can be found without asking users to paste anything sensitive. Lane 2, GitHub: a "Report on GitHub" option opening a prefilled issue template (browser, version, route, correlation ID — no personal data). The bridge: in-product reports that turn out to be general platform bugs get promoted to public issues, scrubbed, with credit if the reporter consents.
- **`SECURITY.md` + GitHub private vulnerability reporting** enabled, so security issues have an obvious private path. Non-negotiable, cheap now, expensive to lack.
- **Public roadmap** as a GitHub Project; weekly tagged releases with human-readable changelogs as the changelog beta users actually read.

### Hygiene (the ten-minute items)

Description and one-liner per Positioning, homepage, topics, social-preview image, README top fold (pitch, prompt→game GIF, live-site link, architecture diagram), History section, pin the repo, enable Discussions. Announce the rebirth as a Release + Discussion — the 22 old-era forks and old watchers get notified for free. License stays GPL-3.0 for the platform (clone-hostile, contribution-friendly); MIT is reserved for extracted components.

Deferred from Stage 0: CONTRIBUTING.md and prepared good-first-issues move to Stage 1 — in a private beta with no visitors, prepared issues just go stale.

**Gate to advance:** creator D7 return >20–30%, cost-per-created-game known with confidence, and the stranger test passes.

---

## Stage 1 — The Polish beachhead (~4–8 weeks)

Goal: 500–2,000 engaged users from communities where we have standing; first organic creator-share loop; the repo joins every message.

- **Lead with the domain's story, carefully.** "The legendary gamedev.pl reborn — the forever free place where anyone can make a game, and it's open source" is a strong Polish tech-press pitch. Written as honoring the heritage, not replacing it. Small history page. PL + EN versions.
- **Waitlist with invite codes.** Every activated user gets 3 invites. Scarcity does two jobs: word-of-mouth and a throttle on creation costs. Never fully open registration while creation is expensive.
- **Open the contribution funnel now that traffic exists:** CONTRIBUTING.md and ~10 good-first-issues, i18n-heavy — community translation is the proven first-PR magnet for a games platform, and the Polish community translating their own platform is the identity loop in miniature.
- **The agent-fixes-issues showpiece.** An issue filed in the morning; an agent triages, reproduces, opens a PR referencing it; deployed by afternoon; GitHub notifies the reporter on close. For the reporter, "I reported a bug to an open-source project and an AI fixed it the same day" is shareable in a way no discount code is. Run the loop quietly for a few weeks first — an issue tracker full of stale agent failures tells the opposite story. Once proven, make it the centerpiece of build-in-public posts.
- **LinkedIn = build-in-public narrative.** Weekly founder-journey posts (costs, weird games users made, agent failures — honesty performs). Every post links the repo: "and it's open source" changes who shares it.
- **X/Twitter = show, don't tell.** 30–60s captures: prompt → agent working → playable game. Post the games, not the platform.
- **Dev-blog posts as star bait**, one per 2–3 weeks, each ending at the repo: the QA gate, feedback-loop-via-PR-comments, the sandboxed-iframe bridge, the phone-controller relay.
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
  1. **Show HN** — the biggest single star event. Title carries the alternative-positioning ("open-source AI game maker"); first comment links the repo and explains the architecture honestly, including the local mode. A front page typically converts to a few hundred stars in 24–48h — enough for GitHub Trending, which compounds for free.
  2. **Product Hunt.**
  3. Targeted subreddits (r/WebGames, r/incremental_games, r/playmygame).
     Before each: lower quotas, confirm the waitlist absorbs overflow. A launch spike that burns the monthly budget in a day is the main failure mode of this stage.
- **Extract the party-mode kit as a standalone MIT package** (relay + phone-controller client) if the Stage 0 deep-dive drew interest — useful outside the product, unserved by existing libraries, and a focused library can out-star the platform repo while funneling attention back. It also sidesteps the games-repo-must-stay-private constraint entirely.
- **Submit to awesome-lists** (awesome-ai-agents, awesome-game-dev, self-hosted lists — local mode qualifies us) — slow drip, permanent.

**Gate to advance:** stable share of players who try creating, retention holding, and a cost per activated creator we'd pay indefinitely.

---

## Stage 3 — Monetize and scale

- **Free to play forever; pay to create more.** Small free creation quota, then credit packs or a creator subscription, priced from real per-game cost with margin. Remixes cheaper than creations in credits too. The mission statement survives monetization: playing is what stays forever free.
- Watch for B2B pull (don't build ahead of it): party mode for team events / education — the LinkedIn audience is the natural channel.
- Only now consider paid acquisition, and only into the _play_ funnel with proven conversion behind it.
- GitHub steady state: Hacktoberfest (October) with prepared issues if the contributor funnel proved itself; meetup/conference talks ("we let an AI agent ship games to production behind a QA gate") each ending on the repo URL; the MIT component(s) as permanent top-of-funnel.

---

## Metrics

- **Product:** creator D7 return, players-per-session, share of players who try creating, cost per created game / per activated creator, signups from shared game links vs. own posts.
- **GitHub:** star _velocity around events_ (Insights → Traffic shows which post converts), first-time contributors per month (the contributor-loop signal), issues filed by non-contributors (the beta-HQ signal), watchers (the story signal). Ignore absolute follower counts in Stages 0–1; org followers lag repo activity by a long way. Forks will stay modest — only contributors run this stack — and that's expected, not a failure.

## Anti-goals

- No paid ads before Stage 3 — that pays to acquire users into an unproven funnel while each creator also costs inference money.
- No simultaneous PH + HN + Reddit launch — the correlated cost spike is unaffordable and staggered spikes teach more.
- No running TikTok/Shorts as an owned channel — instead make sharing so easy creators post their own games there.
- No fully open registration "because growth" — the invite gate is the cost control.
- No incentivized stars, ever.
- No publicly promising the agent-fixes-issues loop before it has worked quietly for weeks.
- No raw user reports on public GitHub — the two-lane model exists so private data never lands in public issues.

## First-week checklist

1. Write down the activation metrics and check them against existing telemetry.
2. Audit the anonymous first-play flow — remove every click between landing and playing.
3. Start the seed-catalog push toward 30–50 curated games.
4. Rewrite the repo description/one-liner per Positioning; fix topics, homepage, social preview; pin the repo; enable Discussions. Ten minutes, permanent effect.
5. Ship the five-minute contributor loop: fixture catalog, dev sign-in, mocked games-repo client, `.env.example`.
6. README overhaul: pitch, prompt→game GIF, "built by AI agents" section, History section, docs index.
7. Add `SECURITY.md`, enable private vulnerability reporting, land the two issue templates and the "Report on GitHub" prefilled link.
8. Post the rebirth announcement as a Release + Discussion (notifies old-era watchers for free).
9. Draft the "gamedev.pl reborn" story (PL + EN) around the mission statement.
10. Ship invite codes for beta users (waitlist/access-list infra mostly exists).
11. Post one prompt→game video on X and one build-in-public post on LinkedIn as a baseline — measure, don't judge, the first ones.

## One-sentence version

Claim the open-source corner of "AI makes games" while the category window is open: since only contributors will ever run the stack, win stars with the story (an AI dev team shipping in public), the community (gamedev.pl's heritage, GitHub as the beta's front door), and the reference material (the engineering notebook) — let shared game pages and party mode do the product marketing, keep creation invite-gated until each new creator is provably affordable, then charge for exactly the thing that costs money, while playing stays forever free.
