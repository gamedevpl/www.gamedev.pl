# Store launch plan — getting gamedev.pl onto the App Store and Google Play

> Written 2026-07-28, replacing the thin M2 bullet list in
> [`mobile-app-plan.md`](./mobile-app-plan.md). That list assumed store work was mostly
> *wrapping* — a Capacitor shell plus adapters. It is not. The wrapper is the small half;
> the large half is **guideline 4.7 compliance across a catalog that grows by agent PR**.
>
> Two constraints the earlier estimate leaned on have been lifted by the owner: agent work
> can run continuously and in parallel, and the public beta can open earlier than the
> closed-beta plan assumed. So this plan is sequenced by **dependency and calendar**, not
> by effort.

## The thing that makes this different from every other milestone

Guideline 4.7's preamble:

> "You are responsible for all such software offered in your app… Software that does not
> comply with one or more guidelines will lead to the rejection of your app."

Every published game must satisfy the full App Review Guidelines, and **one
non-compliant game rejects the whole app**. The catalog grows on every merge, so this is
not a one-time gate — it is a permanent obligation that must be enforced *mechanically*,
the way the touch contract is, or it will be enforced by App Review at random intervals
instead.

This is the single most important design consequence in this document: **every 4.7
requirement must land as a CI check in the games repo, not as a rule in agent
instructions.**

## Where we actually stand

| Requirement | State |
| --- | --- |
| 4.8 Sign in with Apple | ✅ live on web since 2026-07-28, reused unchanged by the shell |
| 4.7.2 no native APIs exposed to games | ✅ **architecturally** — `sandbox="allow-scripts"`, no `allow-same-origin` |
| 4.7.3 no data/permissions to individual games | ✅ games receive nothing |
| 1.2 / 4.7.1 report mechanism | ✅ `ReportGameButton` |
| 1.2 / 4.7.1 filtering | ✅ Vertex moderation + validate.ts + human merge gate |
| 1.2 / 4.7.1 published contact | ✅ `admin@gamedev.pl`, DSA contact point |
| 1.2 / 4.7.1 **block abusive users** | ⚠️ operator-side `tier: 'blocked'` only — not user-facing |
| 4.7.4 **index + universal links** | ❌ catalog exists; universal links do not |
| 4.7.5 **age rating + age restriction** | ❌ nothing rates a game or gates by age |
| Apple account | ✅ Individual, Team `ZLSCSP42P9` |
| Play account | 🚧 paid, in identity verification |
| Capacitor shell | ❌ not started |

**4.7.2 deserves a note.** It is where most mini-app platforms fail, because bridging
native APIs into web content is the obvious convenience. The security model forbids exactly
that and always has ([`security-model.md`](./security-model.md)). An invariant adopted for
security reasons turns out to satisfy the hardest 4.7 clause for free — and it must not be
softened for the Capacitor build. **No Capacitor plugin may ever be reachable from a game
iframe.**

---

## Tracks

Five tracks. **T1, T2 and T3 are mutually independent** and can run concurrently; T4 is
owner-only and already moving; T5 is calendar and cannot be compressed.

### T0 — Open the public beta (unblocks everything downstream)

A store listing behind an invite allowlist is discovery you cannot serve. This is the
gating track, and it is closer to done than the docs suggest.

- [ ] Verify content-safety **slice 1 + 1b** are genuinely complete — the Vertex checker is
      live and `ReportGameButton` exists, so the `PRIVATE_BETA=false` hard gate in
      [`closed-beta-launch-plan.md`](./closed-beta-launch-plan.md) may already be satisfied.
      Confirm rather than assume; this is one grep and one prod check.
- [ ] Slice 2's moderation metrics (count by category/uid) so attempted abuse is visible
      the moment the walls come down.
- [ ] **Relay split** — lift `--max-instances 1`. Move the WebSocket relay into its own
      Cloud Run service pinned at one instance; the main API loses the pin and autoscales.
      Room state stays in memory, which is correct: frames run at 40/s, so Firestore is
      unusable and Memorystore is real money for a feature nobody is straining.
      Until this lands, public traffic hits a single container with no redundancy.
- [ ] **Legal** — lawyer review of terms/privacy, and a decision on the UŚUDE art. 5(2)
      identity gap, which is currently accepted *because* exposure is small. Opening the
      beta is exactly the change that invalidates that reasoning.
      See [`legal-compliance-plan.md`](./legal-compliance-plan.md).

### T1 — Age rating (4.7.5) — the largest new piece

**Age-appropriateness is not derivable from source.** This is the structural difference
from the `touch` contract: `tools/lib/touch.ts` reads a game's code and knows the answer.
Nothing in a game's code says whether its content suits a nine-year-old. So the rating must
be **declared and then verified**, with CI enforcing that a declaration exists and the
moderation layer checking it is honest.

- [ ] Add `ageRating` to the games-repo frontmatter + `catalog.json` (Apple bands: `4+`,
      `9+`, `12+`, `17+`; map to IARC for Play).
- [ ] `tools/validate.ts` check: **fail-closed**, no publish without a rating. Same posture
      as Check 13 — an unrated game is a rejected build, not a defaulted one.
- [ ] Extend the Vertex moderation pass to rate the *spec* at submission time, so the
      declared rating is generated from content rather than guessed by the agent.
- [ ] Retrofit all 73 published games. Metadata-only, so it should **not** trigger the
      media-recapture cost that shared/GameKit edits do — verify that before starting.
- [ ] Web: per-game rating badge, and filter games above the viewer's age band.
- [ ] **The app's own rating is the ceiling of the catalog.** Decide the ceiling and make
      CI reject anything above it, or every 17+ game re-rates the entire app.

**Privacy tension worth deciding deliberately.** 4.7.5 wants restriction "based on verified
or declared age", which pushes toward collecting age data — against a deliberately minimal
posture (no cookie banner, structurally anonymous play telemetry, and that is
[an asset, not an accident](./legal-compliance-plan.md)). Recommended: collect a **declared
age band**, never a birthdate; store it on the user record; treat signed-out visitors as
the most restrictive band. Terms already require 16+, so the band is mostly confirmatory.
This does touch the privacy policy and is a lawyer-review item in T0.

### T1b — WebKit in games CI (4.7's engine clause)

4.7 requires mini apps to run on **standard WebKit and JavaScriptCore** — no custom JS
engine, no alternative renderer — and, more sharply, that the software *"only use
capabilities available in a standard WebKit view (e.g. it must open and run natively in
Safari without modifications)"*.

The first half we satisfy by construction: Capacitor uses WKWebView, games are plain
HTML/JS/CSS in a sandboxed iframe, and this repo ships no engine. It also retroactively
vindicates the appendix's rejection of a "custom native rendering bridge" for games — that
option would have violated this outright, so **the decision rule "the native boundary may
move outward but never inward" now has store policy behind it, not only architecture.**

The second half is **not covered, and the plan previously claimed it was.** The appendix
lists "WebKit as a first-class CI target" among costs already absorbed in M0. It is not:
the games repo's capture/validate harness drives **headless Chrome only**
(`tools/capture.ts`), and `apps/e2e` is Chromium-only. No game has ever been executed in
WebKit before publication.

- [ ] Add a WebKit run to games CI — Playwright's `webkit` is the cheap route, and it is the
      same engine family as WKWebView even though it is not literally Safari.
- [ ] Scope by risk first: 67 of 73 games ride shared GameKit, so a WebKit-clean GameKit
      carries most of the catalog. The **3 `native` games** are where per-game risk is
      concentrated. Prove GameKit first, then sweep.
- [ ] Decide whether WebKit is a **blocking** check or a reported one. Blocking is right
      eventually; making it blocking on day one may fail games that are merely imperfect
      rather than broken.

This is worth doing whether or not the store apps ever ship: iOS Safari is a large share of
mobile traffic today, and a Chromium-only pipeline is how a Safari-broken game reaches
production unnoticed.

### T2 — Universal links + software index (4.7.4)

- [ ] Serve `/.well-known/apple-app-site-association` (JSON, no extension, correct
      content-type) — note this is a well-known file that genuinely **is** required, unlike
      the domain association file Sign in with Apple did not need.
- [ ] `assetlinks.json` for Android App Links.
- [ ] Associated Domains entitlement in the shell; deep links for `/play/<slug>`,
      `/join/<room>`, `#/status/<token>`.
- [ ] Machine-readable index of every game with its metadata and universal link. The
      catalog is most of this already; it needs an Apple-facing shape.

### T3 — Capacitor shell + platform adapters

- [ ] `apps/mobile/` wrapping the built SPA; iOS + Android projects; CI with pinned actions.
- [ ] `apps/web/src/platform/` — one interface per capability that differs by vehicle, with
      a web implementation and a Capacitor implementation. **Nothing else in the SPA may
      branch on platform.**
- [ ] Native sign-in: Google (Credential Manager / iOS) and Apple → the existing
      `/api/auth/google` and `/api/auth/apple`. The Apple verifier already takes a *set* of
      audiences, so the shell adds its bundle ID to `APPLE_CLIENT_IDS` — no second verifier.
- [ ] Push registration (APNs/FCM) into the existing per-user subscription registry
      alongside the web-push rows it already holds.
- [ ] QR scanner for join links.
- [ ] **Guard 4.7.2 with a test**, not a convention: assert no Capacitor bridge is reachable
      from a game iframe. This is the clause that gets apps pulled, and it is the one an
      innocuous convenience PR would silently break.
- [ ] User-facing **block** action (4.7.1) — scope it against the real surface: creator
      names and party nicknames.

### T4 — Accounts and signing (owner)

Tracked in [`store-accounts-setup.md`](./store-accounts-setup.md). Play verification is in
flight; ASC API key and the Android upload keystore are minutes of work once needed.

### T5 — Calendar (cannot be compressed by parallelism)

- **Play closed testing**: ~14 continuous days with a tester cohort for new personal
  accounts. **Recruiting the cohort may be the real constraint** — the closed beta may not
  have enough people. Start recruiting before the build is ready.
- **App Review**: days if clean; weeks if 4.7 findings come back.
- **Store listings**: screenshots, descriptions, privacy manifests, data-safety form.

---

## Critical path

```
T0 (public beta) ──────────────┐
T1 (age rating)  ──┐           ├──► store submission ──► T5 review ──► listed
T2 (universal links)├──► T3 shell ┘
T4 (accounts/signing) ─────────┘
```

T1 and T2 gate submission but **not** the shell, so all three build concurrently. T0 gates
the listing being *worth* having, not the engineering. T5 is pure calendar and should be
started as early as it legally can be.

## Decisions needed from the owner

1. **Catalog age ceiling** — what is the app's rating, and does CI reject anything above it?
2. **Declared age band**: accept collecting one, given it touches the privacy policy?
3. **How early does the public beta open** — before or after the relay split? Before means
   accepting a single container with no redundancy for public traffic.

## What this plan does not do

It does not build store-only features before approval exists — the standing rule from
[`mobile-app-plan.md`](./mobile-app-plan.md)'s risk section. If 4.7 review goes badly, the
PWA remains the fallback, and **that fallback now delivers the whole functional case**:
installed on iOS, push confirmed working on a real device 2026-07-28. The stores add
discovery, not capability.
