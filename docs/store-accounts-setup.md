# Store accounts & signing — owner checklist

> Owner-only work: none of it can be done from this repo. Decisions recorded 2026-07-28.
> Companion to [`mobile-app-plan.md`](./mobile-app-plan.md) M2 and the Sign in with Apple
> section of [`auth-and-usage-plan.md`](./auth-and-usage-plan.md).

## Decisions already made

| Question | Answer |
| --- | --- |
| Company (sp. z o.o.)? | **No.** |
| JDG? | **No** — it does not get "Gamedev.pl" onto the App Store (Apple rejects trade names and treats a sole proprietorship as an individual), and VAT registration + business legal status are two of Apple's own trader-status factors, which is what publishes an address. |
| Personal legal name public on store listings? | **Accepted.** Applies to **store listings only** — the website still publishes "Gamedev.pl" with no personal name; leave `apps/web/src/legal/operator.ts` alone. See [`legal-compliance-plan.md`](./legal-compliance-plan.md). |
| Personal address public? | **No** — avoided by declaring non-trader, which holds only while nothing monetizes. |

---

## Phase A — Apple Developer + Sign in with Apple on the web

Unblocks code that is already deployed and dormant. Publishes **nothing** publicly: there
is no App Store listing at this stage.

- [x] **A1.** Enrolled as **Individual** 2026-07-28. Team ID `ZLSCSP42P9`.
      Do *not* attempt organization enrolment — it needs a legal entity and a D-U-N-S number.
- [x] **A2.** App ID `pl.gamedev.app`, Sign in with Apple enabled.
      Note: the **Description** field accepts only letters, numbers and spaces — `Gamedev.pl` is rejected for the dot, so it is `Gamedev`.
- [x] **A3.** Services ID `pl.gamedev.web` (description `Gamedev`).
      Services IDs are **under Identifiers** via the filter dropdown, *not* the left-nav "Services" section, which is a different feature.
- [x] **A4.** Web Authentication Configuration: primary App ID `pl.gamedev.app`,
      domain `www.gamedev.pl`, return URL `https://www.gamedev.pl/` (exact, trailing slash, https —
      Apple rejects every `http://` URL, which is why this flow cannot be tested below a deployed origin).
- [x] **A5.** ~~Download Apple's domain-verification file~~ — **not required, and the console never offered it.**
      Apple validates the web flow against the **registered Return URLs**; the
      `apple-developer-domain-association.txt` file belongs to the private-email relay service, which this
      product deliberately does not use. If a future need appears, the Download button lives in the panel
      behind the **+** next to *Website URLs*.
- [x] **A6.** Repo Actions *variables* set 2026-07-28 (not secrets — both values are public):
      `APPLE_SERVICES_ID=pl.gamedev.web`, `APPLE_CLIENT_IDS=pl.gamedev.web`.
- [ ] **A7.** You sign in with Apple on https://www.gamedev.pl once, from a device with an Apple ID.
      **Choose "Share My Email", not Hide My Email**, for the first test — the relay path deliberately
      does not link to an existing account.

**Phase A ends here and is worth doing on its own**, independent of any store app.

---

## Phase B — Google Play

Only when a Capacitor build actually exists. Do **not** pay before B1.

- [ ] **B1.** Walk the [Play Console](https://play.google.com/console/signup) signup as a **Personal** account **without paying**, to the point where it shows what will be displayed publicly.
      Confirm no address is shown for a free, non-monetized app. If it insists on a public address, stop and get a
      mail-forwarding address (*biuro wirtualne*, ~50–150 PLN/mo) before continuing.
- [ ] **B2.** Pay the **$25** one-time fee. Complete identity verification (government ID).
- [ ] **B3.** Set **Developer name** = `Gamedev.pl`. This is the public listing name and is separate from the
      verified legal name shown under "About the developer".
- [ ] **B4.** Declare **DSA trader status: non-trader**. Google applies this regardless of target countries.
- [ ] **B5.** Note the closed-testing requirement for new personal accounts (a cohort of testers for **14 continuous days**
      before production release — the exact count has changed more than once; read it in Console).
      This is a calendar dependency, not a task: start it early.

---

## Phase C — Signing

- [ ] **C1.** App Store Connect → Users and Access → **Integrations** → App Store Connect **API key**, role *App Manager*.
      Save the `.p8` (downloadable **once**), the **Key ID** and the **Issuer ID**. Give them to Claude for GitHub secrets.
      Use this rather than an Apple ID + password anywhere in CI.
- [ ] **C2.** Android upload key — run locally, then back up the `.jks` **and** its passwords somewhere that survives this laptop:
      ```bash
      keytool -genkeypair -v -keystore gamedev-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
      ```
- [ ] **C3.** **Enrol in Play App Signing** when creating the app in Console. Without it, losing the keystore means the app
      can never be updated again — new package name, install base gone. With it, a lost upload key is a support ticket.
- [ ] **C4.** Never commit either key. Claude adds them as GitHub Actions secrets (keystore base64-encoded).

---

## Standing trigger — re-read this before monetizing

Trader status under the EU DSA is what publishes **address + phone number** on an EU store
listing. Apple's factors include revenue from the app — **paid, in-app purchase, or
ad-sponsored** — plus VAT registration and business legal status.

The non-trader declaration above is truthful only while the app earns nothing. **The day
ads or any paid tier are added, both store declarations must be updated and a public
contact address becomes mandatory.** Get a mail-forwarding address before that ships, not
after. This also reverses [`mobile-app-plan.md`](./mobile-app-plan.md) open question 4's
"no monetization anywhere" answer, so the two are linked.

Non-trader status has one visible cost: EU consumers are told that consumer-protection law
does not apply to contracts with you.

---

## Blocked on engineering, not on you

- **`--max-instances 1`** is hard-coded in both deploy paths because multiplayer rooms are
  per-instance memory. Store apps point public traffic at a single container. This is an M2
  launch blocker and is Claude's work, not an account task.
