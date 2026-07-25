# Legal compliance plan

> **Not legal advice.** This was assembled by reading the law against what the code
> actually does. Before the service opens beyond the closed beta, a Polish lawyer
> should review both published documents. What follows is written to make that review
> cheap: every claim points at the provision that requires it and the file that
> implements it.

The operator is a natural person resident in Poland, so five bodies of law apply:

| Law                                                                    | What it demands here                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **RODO / GDPR** (2016/679)                                             | Privacy policy, lawful bases, user rights, breach reporting                    |
| **UŚUDE** (ustawa o świadczeniu usług drogą elektroniczną, 18.07.2002) | Published _regulamin_, provider identity, complaints procedure                 |
| **DSA** (2022/2065)                                                    | Contact point, moderation description, notice-and-action, statement of reasons |
| **AI Act** (2024/1689) art. 50                                         | Disclose AI interaction; mark AI-generated output — **applies 2 Aug 2026**     |
| **PKE** (Prawo komunikacji elektronicznej) art. 399                    | Consent for non-essential storage on the user's device                         |

## What the data audit found (2026-07-25)

Two findings shaped everything below.

**No cookie banner is required, and that is worth protecting.** The only cookie is the
session cookie set after sign-in; `localStorage` holds the chosen language and the
user's own submission list; there is no third-party analytics anywhere in `apps/web`.
All of that is "strictly necessary to provide the service the user requested" under PKE
art. 399, which is the exemption. Adding Google Analytics — or any third-party tracker —
would forfeit this and require a consent management platform. Don't, without budgeting
for that.

**Play telemetry is genuinely anonymous, structurally.** `apps/web/src/telemetry.ts`
mints a random session id per _open_, in memory, never persisted; the API stores neither
uid nor IP (asserted by `apps/api/src/telemetry.test.ts`, "stores no player identity").
The privacy policy says so plainly because it is true and it is a real differentiator.
If that ever changes, the policy is wrong the same day.

Also relevant: the games repo is **private**, so a submitted spec does not become public
by being submitted. The privacy policy says exactly this; if the repo is ever opened,
that sentence becomes false and must change first.

## Phase 1 — shipped

| #   | Item                                             | Where                             | Requirement                           |
| --- | ------------------------------------------------ | --------------------------------- | ------------------------------------- |
| 1   | Privacy policy, PL + EN                          | `apps/web/src/legal/privacy.*.ts` | GDPR art. 13–14                       |
| 2   | Regulamin / Terms, PL + EN                       | `apps/web/src/legal/terms.*.ts`   | UŚUDE art. 8; DSA art. 14             |
| 3   | Site footer with provider identity               | `apps/web/src/SiteFooter.tsx`     | UŚUDE art. 5; DSA art. 11–12          |
| 4   | Legal routes reachable signed-out                | `router.ts`, `App.tsx`            | GDPR art. 13 (notice _at_ collection) |
| 5   | AI badge on catalog cards + player               | `ArcadeCatalog.tsx`, `App.tsx`    | AI Act art. 50(2)                     |
| 6   | AI notice in the creator flow                    | `HeroPromptSection.tsx`           | AI Act art. 50(1)                     |
| 7   | Machine-readable AI marking in the game document | `apps/api/src/assemble.ts`        | AI Act art. 50(2)                     |
| 8   | "Report game" notice-and-action (mailto)         | `ReportGameButton.tsx`            | DSA art. 16                           |

Design decisions worth knowing before editing:

- **Documents are data, not JSX or markdown** (`legal/types.ts`). A lawyer can edit the
  prose without touching React, and `legal/legal.test.ts` fails the build if the Polish
  and English versions drift apart in section count, list length or table shape — the
  same guard `i18n/locales.test.ts` provides for UI strings.
- **Polish is binding and is the fallback language.** `legalDocument()` returns Polish
  for anything that isn't English, because a reader in a third language is better served
  by the text that actually governs.
- **The legal route renders before the closed-beta gate** in `App.tsx`. A privacy policy
  behind a login is not published, and the sign-in button is the moment of collection.
- **The player badge now says "AI-generated game"** where it used to say "Playing" —
  which the full-screen game already conveyed. The disclosure earns that space.

## Launch blockers before opening beyond closed beta

1. ~~**A contact address that receives mail.**~~ **Cleared 2026-07-25** —
   `admin@gamedev.pl` is configured and receiving. It is published as the GDPR contact,
   the DSA single point of contact, and the reklamacja address. Keep it alive for as
   long as the documents are published; if it is ever retired, change
   `legal/operator.ts` first. The domain's other addresses only send.
2. **Publish a legal identity.** The operator is published as "Gamedev.pl" with no
   personal name and no address, by owner's decision — a private individual's name and
   home address should not be on a public site. This is an accepted gap, not an
   oversight: UŚUDE art. 5(2) wants a provider's legal identity (a natural person's name
   and address, or a company's name, seat and address) and GDPR art. 13(1)(a) wants the
   controller's identity; a service name plus a working email does not fully satisfy
   either. **Registering a JDG or company and publishing that entity here closes both
   gaps without exposing an individual** — set `OPERATOR_LEGAL_NAME`, `OPERATOR_ADDRESS`
   and `OPERATOR_TAX_ID` in `legal/operator.ts` and every surface picks them up. Staying
   in closed beta until then keeps the exposure small.
3. **Lawyer review of both documents.**

## Phase 2 — next

- In-product report form (reason, location, good-faith declaration) writing into the
  moderation queue, replacing the mailto. DSA art. 16 also wants a **confirmation of
  receipt**, which a mailto cannot send.
- Statement-of-reasons delivery (DSA art. 17) through the existing notifications system
  when a game is removed or a submission refused — the terms already promise this.
- Self-service account deletion and data export (GDPR arts. 17, 20). Today both are an
  email process, which is lawful but slow and manual.
- A record of processing activities (RoPA) and a written breach-response runbook. The
  processing table in the privacy policy is most of the RoPA already.

## Phase 3 — before open registration or monetization

- Consumer law: the moment the service is paid — or "paid for with data" under the
  Digital Content Directive — withdrawal rights and conformity obligations attach.
- Re-check DSA tier. The micro/small-enterprise exemption (art. 19) covers the platform
  tier only; arts. 11–17 already apply and are implemented. Crossing 50 employees or
  €10M turnover adds transparency reporting and an internal complaint-handling system.
- Confirm the operating vehicle (unregistered activity vs. JDG vs. company) with an
  accountant — this drives what identity data must be published.

## Keeping this honest

The privacy policy describes real data flows, not typical ones. When you change what the
service collects, sends to a third party, or retains, the document is part of the change:

- new third-party service → row in the recipients table, and a transfer-basis sentence
  if it is outside the EEA;
- anything written to the user's device beyond session and language → PKE art. 399 is
  back in play and a consent banner with it;
- telemetry gaining any identifier → §3 of the privacy policy becomes false;
- games repo made public → §4 of the privacy policy becomes false.
