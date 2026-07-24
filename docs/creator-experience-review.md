# Creator experience review (2026-07-24)

Triggered by owner feedback after watching a real build ("chciałbym zagrać w grę typu cannon
fodder") run for three hours on the status page. Two concrete complaints, plus a request to look
at the flow from more than one angle. This is the review; the first batch of fixes is already in.

## Shipped in this pass

| Complaint                                                                        | Fix                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "my feedback prompts are not visible anywhere"                                   | The status page's build log is now a merged **activity feed**: agent commits and the creator's own change requests on one timeline, newest first. Sent feedback is echoed locally straight away, and re-read from the PR conversation afterwards (`progress.revisions`), so it survives a reload and shows on any device. |
| "lacks sense of time"                                                            | Every feed entry carries a localized relative timestamp, the header shows "last update N ago", the checklist shows "Working on: <first unfinished task>", and after 15 minutes of agent silence the page says so instead of looking frozen.                                                                               |
| "the messages are not i18n which is a huge problem"                              | `GET /api/submissions/:token?locale=` translates the agent's commit subjects and checklist into the creator's language (Vertex, cached per source line, fails open to English, kill switch `TRANSLATE_BUILD_LOG=false`).                                                                                                  |
| "progress updates from copilot are very slow… only commit messages"              | The submission issue now carries a **Progress reporting** section telling the agent to open the draft PR early, keep the PR checklist ticked, commit in small steps, and write commit subjects about the _game_, not the code.                                                                                            |
| "no gist of my own in-progress games on the main page / I need to save the link" | New **Your games** rail on the home page, backed by `GET /api/submissions/mine` (Firestore ownership → re-minted status tokens). Works on a device that never saw the tracking link.                                                                                                                                      |
| "the my projects link from the hamburger menu is not working"                    | It pointed at `#studio`, a section that is no longer rendered anywhere. It now scrolls to the my-games rail, including from the status route (navigate home, then scroll once it mounts).                                                                                                                                 |

## What the personas see next

### The 11-year-old on a phone (the actual target user)

- No expectation is ever set for **how long** this takes. "In the queue" for 20 minutes with no ETA
  is where a kid leaves. Show a typical range ("most games take 20–60 min") from real data.
- The rail and status page assume a desktop-ish width; the play/draft flow on a phone is untested.
- Nothing tells them the build **failed**. `needs_changes` is a dead end with no "try again" button.
- Quota is invisible until it's spent — 5 submissions/day, discovered as an error.

### The returning creator (this feedback's author)

- Still no way to tell **stuck** from **slow**. We now say "the agent has been quiet"; we can't yet
  say "the agent errored". Surfacing PR check status / a failed workflow would close this.
- No way to **abandon** a build, or to re-prompt from scratch without spending another submission.
- The revision loop is one-way: the agent never replies "done, try it now" in the creator's words.
  A short agent-authored status line per push (a `STATUS:` trailer in the commit, or the PR body)
  would beat inferring intent from commit subjects.

### The non-English creator

- Build log: fixed. **Not** fixed: the game itself (titles, HUD, in-game text) is agent-authored in
  whatever language the agent picked, and the catalog shows it verbatim.
- Notification emails and push bodies are keyed i18n — good — but the QA questions, moderation
  rejections and quota errors are a mix of localized copy and raw API strings.

### The sharer

- The only link to an in-progress game is the **status token**, which also grants the right to send
  feedback and burn quota. There is no read-only "look what I'm making" link. That is the single
  biggest missing growth loop, and it needs a separate, non-privileged share token.

### The screen-reader / keyboard user

- The status page changes underneath the user with no `aria-live` announcement; the activity feed
  and the timeline are visual-only. The feed items should be a live region (polite).
- `.build-activity-time` renders inside `<time>` with no `datetime` attribute.

### The operator (you)

- Cost per build is unmeasured: refine + moderation + (now) translation calls are all Vertex, all
  uncapped per user beyond daily action quotas.
- There is no dashboard for "builds currently running / stuck / failed" — the sweep knows, but only
  emits notifications.

## Suggested order

1. **Read-only share link** for a draft/published game (growth, and it defuses token-sharing).
2. **ETA + failure surfacing** on the status page (`queued` with no ETA is the top drop-off risk).
3. **Mobile pass** over the status page, the rail and the draft player.
4. **Agent-authored progress line** per push, replacing inference from commit subjects.
5. **Retry / abandon** actions on a build, and visible quota.
6. Accessibility pass (live regions, `datetime`, focus handling on theater open/close).
