# Site assistant (the mascot)

A signed-in visitor can ask the mascot in the corner of the catalog, game and profile pages
what to play. It is a pilot of `genaicode/backend`: the model runs behind `/api/assistant`,
and everything it can do happens in the visitor's page (search the catalog, open a game
page, open home / create / agents). It never shows in Studio, on `/create`, or over a game.

## Switches

| What                              | Where                                          | Default            |
| --------------------------------- | ---------------------------------------------- | ------------------ |
| On or off                         | deploy variable `SITE_ASSISTANT=true`          | off                |
| Model                             | deploy variable `SITE_ASSISTANT_MODEL`         | `claude-haiku-5-5` |
| Pause now                         | operator limits `assistantPaused`              | false              |
| Tokens per day, everyone together | operator limits `globalDailyAssistantTokenCap` | 500,000            |
| Prompts per day, one account      | `DAILY_ASSISTANT_PROMPT_QUOTA` (not threaded)  | 20                 |

The spend brake has an `assistant` lane; a tripped budget pauses it with the first group.
Off, paused or out of tokens, the page falls back to the browser's built-in model where
there is one, and otherwise says the mascot is resting.

## What holds the cost

- Signed-in accounts only; blocked accounts and cross-site requests are refused.
- Every model call first reserves its worst case against the shared daily cap in one
  transaction, then settles to what it used. If the counter cannot be reached, the call
  is refused: nothing runs uncounted.
- One answer is at most 512 tokens, one prompt at most 4 model calls, one conversation
  at most 20,000 tokens, and the route takes 30 requests a minute.
- The model has no server tools. Its three page tools are pinned on the server, none of
  them changes anything, and `open_game` only opens a slug that is in the catalog.
- The conversation travels in a token sealed with a key derived from `SESSION_SECRET`.
- Logs carry counts (`site_assistant_turn`), never the conversation's text.

The model key is the Anthropic one the seed provider already uses. Without a key (or while
`SITE_ASSISTANT` is off), `/api/assistant/turn` answers 404, `/api/assistant/info` answers
200 with `enabled: false` (so pages never log a 404 probe error), and the mascot stays hidden.
