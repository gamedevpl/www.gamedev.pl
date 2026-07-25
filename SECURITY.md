# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting:
[open a private advisory](https://github.com/gamedevpl/www.gamedev.pl/security/advisories/new).
It is visible only to the maintainers until a fix is published. If that form is unavailable
to you, email **fb@tanczyk.pl** with "security" in the subject.

What helps: what you did, what happened, and why you think it is exploitable. A proof of
concept is welcome but not required — a clear description of the weakness is enough to act
on. Please do not test against other people's accounts or games; a local checkout
(`docs/local-development.md`) runs the whole product with no cloud services attached.

Expect an acknowledgement within a few days. This is a small project run by one maintainer,
so please allow reasonable time for a fix before disclosing publicly.

## What is in scope

This repository is the platform: the web app, the API, the sandboxed game player, and the
multiplayer relay. Reports about the deployed site at https://www.gamedev.pl belong here too.

Particularly interesting:

- **Anything that escapes the game sandbox.** Games are real, unconstrained code, rendered
  in an `<iframe sandbox="allow-scripts">` with **no `allow-same-origin`**. That boundary is
  the product's central safety assumption: a game must not be able to reach the parent page,
  cookies, storage, or any authenticated endpoint. A way around it is the most serious class
  of bug this project can have.
- Authentication and session handling, or anything that lets one account act as another.
- Access to a game, draft, or build that the requester should not be able to see.
- Server-side request forgery, or reading repository content the API boundary should keep
  private.
- Leaking credentials or tokens into responses, logs, or an assembled game document.

## What is out of scope

- Content of individual games. To report a game as illegal or harmful, use the reporting
  route on the site itself — that is a separate, legally defined process.
- Findings from automated scanners with no demonstrated impact, missing hardening headers
  with no exploit path, or denial of service through sheer volume of traffic.
- Anything requiring a compromised device, a malicious browser extension, or physical access.

## Safe harbour

Good-faith research that follows this policy is welcome, and we will not pursue or support
action against you for it. Stay within your own accounts and data, do not degrade the
service for other people, and give us a chance to fix things before going public.
