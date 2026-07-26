# gamedev.pl

**Describe a game. An AI agent builds it. Everyone plays it in the browser.**

[**Play now → www.gamedev.pl**](https://www.gamedev.pl) · closed beta

![Stars](https://img.shields.io/github/stars/gamedevpl/www.gamedev.pl?style=flat-square)
![License](https://img.shields.io/github/license/gamedevpl/www.gamedev.pl?style=flat-square)

You write a few sentences about a game you want. A coding agent asks what it needs to know,
writes it as **real, unconstrained code**, and opens a pull request. When the build passes, the
game is in the arcade — playable instantly, no install, no account. Bring friends: some games
turn phones into controllers around one shared screen.

This repository is the platform that does all of that, and it is open source.

## Watch an AI dev team ship in public

Most of this codebase was written by coding agents, and the pipeline that builds the games is
itself run by agents. That is unusual enough to be worth watching rather than just reading
about:

- A creator's description becomes a spec, and a **QA gate** asks real clarifying questions
  before any code is written.
- An agent implements the game in a separate games repository and reports progress over a
  live build channel while it works.
- After playing, a creator can ask for changes — the feedback goes back to the agent as a
  pull-request comment, and the agent iterates.
- Every game must pass CI before it can be published.

**One guarantee that CI enforces:** every game in the catalog is playable with a thumb. Touch
support is _derived from each game's source_, not declared in its spec, so a game cannot claim
playability it does not have.

The interesting engineering is written up in [`docs/`](./docs) — start with
[`docs/README.md`](./docs/README.md).

## Try it locally in five minutes

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. You get a browsable arcade, a playable game, a working
sign-in, and a creation flow — with **no API keys, no GitHub token, and no cloud project**.
Game content comes from a local games checkout if you have one, and from bundled fixture games
if you don't.

Full detail, including what is deliberately faked locally and what will surprise you, is in
[`docs/local-development.md`](./docs/local-development.md).

> **Note:** this is not a self-hostable game generator. Running the stack locally is for
> people who want to work on the platform; game creation on the live site runs through
> infrastructure that is not part of this repository.

## Safety model

Games are real code, so they cannot be safety-checked the way structured data can. Safety
comes from **execution, not inspection**: every game is assembled into one self-contained
document and rendered in an `<iframe sandbox="allow-scripts">` with **no `allow-same-origin`**.
It cannot reach the parent page, cookies, storage, or any authenticated endpoint.

That boundary is the single most important invariant in the project. If you find a way around
it, please report it privately — see [`SECURITY.md`](./SECURITY.md).

## Repo layout

```
apps/
  web/               Vite + React + TypeScript — arcade, sandboxed player, creation flow
  api/               Fastify + TypeScript — catalog, submissions, auth, multiplayer relay
  api/fixtures/      A games-repo-shaped directory so the app runs with no credentials
packages/
  game-generator/    The generator seam: GameGenerator interface and GameProject type
infra/               Cloud Run deployment scripts (imperative gcloud, not Terraform)
docs/                The plan of record — read this before making assumptions
```

Games themselves live in a **separate repository** maintained by coding agents; this app is
the catalog, the player, and the submission surface. See
[`docs/games-repo.md`](./docs/games-repo.md).

## Contributing

Contributions are welcome, and the local setup above is designed so your first change can be
running in minutes.

- **Found a bug?** [Open an issue](https://github.com/gamedevpl/www.gamedev.pl/issues/new?template=bug_report.yml).
  There is a "Report a bug" link in the site footer that prefills it for you.
- **Have an idea?** [Open a feature request](https://github.com/gamedevpl/www.gamedev.pl/issues/new?template=feature_request.yml),
  or start a [discussion](https://github.com/gamedevpl/www.gamedev.pl/discussions).
- **Found a security problem?** Do not open an issue — see [`SECURITY.md`](./SECURITY.md).
- **Writing code?** Run `npm run lint && npm run type-check && npm run test` before you finish.
  Coding agents should read [`docs/contributing-for-agents.md`](./docs/contributing-for-agents.md).

Translations are a good first contribution: the interface lives in
`apps/web/src/i18n/locales/` and currently ships English and Polish.

## History

gamedev.pl is an old name in Polish game development — for years this domain was a community
site where a generation learned to make games, and this repository held its source. The
community site survives in the early history of this repo.

The domain now does something different with the same intention: it used to teach people how
to make games, and now it lets anyone make one. That continuity is deliberate.

## License

[GPL-3.0](./LICENSE). Developed with [Genaicode](https://github.com/gtanczyk/genaicode).
