# Explicit Studio play journal attachments

Studio keeps a bounded recording in the current tab while its game is open. Nothing
from this recorder is uploaded until the creator selects **Attach play recording**
and sends that message to a managed builder. The selection freezes the recording;
continuing to play or changing the displayed build does not change that attachment.
Removing the selection sends no journal. A failed send retains the selection.

The buffer holds up to two minutes, 10,000 entries and about 2 MB of JSON, whichever
fills first. Old entries are dropped and counted. Recorder overflow, expensive or
unsupported snapshots and serialization failures are represented as coverage gaps.
Closing the tab loses unsubmitted history. Switching games clears the live buffer;
replacing a build starts a new recording. The saved version describes the displayed
build, not a later agent edit. A build without a version reports `unknown`.

The recorder collects game-frame keyboard/pointer events, console/errors, GameKit
signals/audio and available harness observations/snapshots. It does not record the
Studio chat input, other tabs, camera/microphone, screenshots or a JavaScript heap.
Games without a snapshot provider still contribute their available events. No
GameKit opt-in or source change is required for basic recording; richer state may
need source instrumentation and another creator recording.

## Delivery and access

The existing authenticated feedback/improvement request carries the selected
recording. The server validates ordered entries and size, gzip-compresses the
attachment (at most 800 KB base64), and stores it separately in `playJournals`.
Only an attachment ID goes into the creator message/brief. Publishing an improvement
opens another job: the attachment is copied into that job before agent dispatch.
Ordinary messages and play telemetry do not acquire journal payloads.

Managed sessions see `read_play_journal`. It accepts the `attachmentId` named by the
creator message and supports frame/time windows, event kinds, frame sampling,
JSON-pointer projections and paginated reads. A session can only read attachments
bound to its authenticated job; public and self-builder clients cannot invoke the
tool. The artifact remains usable after the creator closes Studio. Reads return the
recorded version, coverage, snapshot status and instrumentation guidance. Game text
is untrusted data. Missing history cannot be reconstructed; this is neither replay
nor control of the creator's browser.

Attachments become unreadable after 30 days. Firestore TTL removes the stored rows;
account erasure also removes the creator's journals, with an erasure fence against
concurrent uploads. Before production rollout, run the existing `infra/setup-gcp.sh`
to enable the added `playJournals.expiresAt` TTL policy. Expiry checks in reads do not
substitute for that physical-deletion policy.

## Verification and measurement

The browser regression exercises the real framed recorder and composer: an ordinary
message sends no journal, explicit attachment freezes a version, and another build
produces a distinct recording. API tests cover dispatch ordering, task isolation,
immutable storage, expiry, erasure and repeated paginated sampling.

This flow affects creator revision (funnel question 4) and build economics (question
7). Existing creator messages containing `playJournalAttachmentId` identify requests
with evidence, and existing job/build events show whether a round started and how
long it took. There is no new anonymous telemetry event or export of journal data
into product analytics; aggregate journal adoption is not yet a dashboard metric.
