# Creator performance MCP disclosure rollout draft

Status: prepared text, not a published notice or an effective policy. The MCP
implementation remains disabled unless `CREATOR_PERFORMANCE_MCP=true` is set.
Studio owner statistics can ship independently.

## Release record

- Actual in-Service notice publication time and production revision: pending.
- Earliest effective date: pending; at least 14 days after that publication.
- Updated privacy policy revision and effective date: pending.
- MCP activation revision and owner-account verification: pending.

Publish a dated announcement where users can see it in the Service and keep the
current policy available during the notice period. Publish the updated privacy
policy in Polish and English at the stated effective date before enabling MCP.
The shared `LEGAL_EFFECTIVE_DATE` currently dates both privacy and terms: the policy
rollout must give privacy its own date if the terms do not change. Do not backdate a
notice, count from a PR merge, or set a future date without publishing the notice.

## Proposed in-Service notice

Replace `[DATE]` with the confirmed effective date after recording publication.

**PL**

Od [DATE] właściciel opublikowanej gry będzie mógł pobrać anonimowe statystyki jej
wydajności przez podłączonego przez siebie asystenta AI (MCP). Raport obejmie FPS,
przerwy między klatkami, wielkość próbki oraz grupy urządzeń, przeglądarek,
rozdzielczości i wersji gry. Nie udostępniamy surowej telemetrii, identyfikatorów
sesji ani tożsamości graczy. Asystent otrzyma raport wyłącznie na żądanie, dla gry
należącej do podłączonego konta. Zaktualizujemy opis danych zwracanych asystentowi
w §5 polityki prywatności. Przed [DATE] ten odczyt MCP pozostaje wyłączony.

**EN**

From [DATE], a published game's owner will be able to request anonymous production
performance statistics through an AI assistant they connect (MCP). The report will
include FPS, frame gaps, sample counts and coarse device, browser, resolution and
game-build groups. It will contain no raw telemetry, session identifiers or player
identity. The assistant will receive a report only on request, for a game owned by
the connected account. We will update the description of data returned to connected
assistants in section 5 of the Privacy Policy. This MCP read remains disabled before
[DATE].

## Proposed policy addition to §5

Add this category to the assistant-access list in the future policy revision.

**PL**

Anonimowe agregaty wydajności Twoich opublikowanych gier: FPS, przerwy między
klatkami, wielkość próbek i grupy urządzeń, przeglądarek, rozdzielczości i wersji;
bez identyfikatorów sesji i tożsamości graczy.

**EN**

Anonymous production performance aggregates for your published games: FPS, frame
gaps, sample counts and coarse device, browser, resolution and build groups; no
session identifiers or player identity.

## Activation check

Verify the notice interval and effective policy before setting the deployment
variable to `true`. Then verify the deployed revision, read an owned published game
through MCP, and confirm that unrelated accounts and revoked credentials still
refuse access. Setting the variable to `false` disables future MCP calls while
preserving Studio access. See [query and measurement limits](creator-game-performance.md).
