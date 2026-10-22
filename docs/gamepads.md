# Gamepad input bridge

The common `GameFrame` mounts `useGamepadBridge` for active play (`autoFocus !== false`).
This covers published games, Party Mode, raw HTML play and Studio Play. Passive
previews receive no pad input. The host uses the HTML5 Gamepad API on its own origin;
the game sandbox stays `allow-scripts allow-pointer-lock`, without an `allow` list.

An authenticated current-frame `gdp` v1 `gamepad:hello` starts animation-frame polling.
Changed state is sent over the current document's reply channel as `gamepad:state`:

```ts
{ ns: 'gdp', v: 1, t: 'gamepad:state', active: true, pads: [
  { index: 0, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [0, 0, 0] }
] }
```

The host sends at most 16 connected devices as `mapping: 'standard'`, four clamped axes and
17 clamped button values per device. Standard-mapped pads pass through. The 8BitDo Micro
(Chrome D-input HID and macOS MFi profiles) is projected onto the standard slots by
physical face position, with its digital cross on buttons 12–15; other raw layouts are
dropped rather than guessed. Omitted controls are zero in GameKit. There is
no fixed four-player browser contract. The game chooses its player limit and maps
physical indices to seats. Hardware names, timestamps and device identifiers are
never passed to the game or recorded. No room or network round trip is needed for
local pad play. Unavailable or denied APIs return an empty list.

Blur, hidden documents and teardown send neutral state with `active: false`; live
frames carry `active: true`. A missing field means active (older hosts). Consumers
must not read the drop to zero in an inactive frame as a release: a button still held
when `active` returns to `true` stays off until it is released, so focus changes
never produce a fresh press. GameKit keeps inactive pads listed, so seats survive. Polling ends on document
replacement, navigation, passive preview transitions and unmount. Frame validation
and bound replies prevent another window or an old game document receiving input.

The paired games-repo change adds the optional `gamepad` module, solo `input.gamepad`
configuration and opt-in `createParty({ gamepads: true, slots })`. The platform's
module allowlist and vendored assembly contract include that module. Deploy the
website half before publishing games that select it. This enables authoring pad
games; existing published games acquire no new action mappings automatically.

Phone Party Mode keeps its existing relay roster. Pads claim locally free seats;
phones retain roster authority if a phone later occupies a local pad's seat. A
unified mixed-device lobby with relay slot reservation is outside this change.

Validation: bridge tests cover request gating, frame authentication, sparse device
indices, neutral state, passive previews and cleanup. Games-repo tests cover solo
mapping, analog deadzones, separate players, join suppression, scene transitions,
disconnects and phone / keyboard coexistence. A physical-device check still needs
real controllers on each supported browser/OS combination.

Instrumentation affects per-game health and session play (measurement questions 2
and 6): existing play / progress / error events still answer those questions. Party
shell lifecycle changes remain observable through `party_step` with `via: 'seat'`.
Controller adoption is a named measurement gap; this change collects no hardware
identity, per-button input or device-specific telemetry.
