# Gamepad findings

Status: KC-09 research spike. The checked-in prototype is development-only and does not ship gamepad support.

## Recommendation

Use a shell relay. The trusted page should poll `navigator.getGamepads()`, normalize the active controller, and send versioned state to the sandboxed game over the existing `postMessage` bridge.

The Gamepad specification currently gives the `gamepad` Permissions Policy feature a default allowlist of `*`, and Chrome exposed the API in the current sandbox without an iframe `allow="gamepad"` attribute. Direct access is technically possible there. It is still the wrong platform boundary:

- Games-repo Check 17 deliberately forbids `navigator.*` in untrusted game code.
- Shell ownership matches the existing sensing and voice bridges.
- The shell can centralize deadzones, remapping, privacy, visibility, reconnects, and controller-to-player assignment.
- The iframe sandbox and its `allow` attribute remain unchanged.

The shared `input` module should own the normalized controller as another local input source. `party` should consume that source for local player slots rather than own browser polling. This keeps single-player gamepad support possible and prevents a second normalization contract from growing inside multiplayer.

References:

- [W3C Gamepad Working Draft](https://www.w3.org/TR/gamepad/), especially sections 3, 4.1, 12.1, and 20.
- [WebKit Safari 10.1 Gamepad announcement](https://webkit.org/blog/7477/new-web-features-in-safari-10-1/).
- [WebKit Safari 18.0 notes](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/), including the WKWebView Gamepad fix.

## Prototype

The prototype lives in `apps/web/src/gamepadSpike.ts` and is mounted beside the sensing and voice shell bridges in `GameTheater.tsx`.

It activates only when both conditions are true:

1. Vite compiled the app in development mode.
2. The page URL contains `?gamepad-spike=1`.

Production builds fold the development condition to false. The prototype adds no control, iframe permission, catalog field, API, or game behavior.

While active, it polls once per animation frame and sends two representations:

1. Party-compatible edges using the existing `{ ns: 'gdp', v: 1, t: 'input', slot: 1, k, d }` vocabulary. Standard buttons 12–15 and axes 0–1 map to the d-pad; standard button 0 maps to `a`.
2. A richer `{ ns: 'gdp', v: 1, t: 'gamepad:state', ... }` frame containing:

```ts
{
  sequence: number;
  sampledAt: number;
  party: { up: boolean; down: boolean; left: boolean; right: boolean; a: boolean };
  gamepad: null | {
    index: number;
    mapping: string;
    axes: number[];
    buttons: Array<{ pressed: boolean; touched: boolean; value: number }>;
    sourceTimestamp: number | null;
  };
}
```

The device identifier is intentionally omitted. It is unnecessary for gameplay and increases fingerprinting surface. `sourceTimestamp` and `sampledAt` make end-to-end latency measurable without adding a second clock protocol.

The prototype is intentionally incomplete: it chooses the first connected controller, maps it to party slot 1, and has no player-facing discovery or remapping UI.

## Browser experiment

Test harness: a localhost page with two `srcdoc` iframes using `sandbox="allow-scripts"`. One had no `allow` attribute; the other had `allow="gamepad"`. Each frame and the top-level page recorded API exposure, effective policy, whether `getGamepads()` threw, returned slot count, and connected count.

Environment: macOS 26.5.2 build 25F84, Apple Silicon. Test date: 2026-08-14.

| Browser                          | Version          | Top level                                                        | Sandboxed, no `allow`                                 | Sandboxed, `allow="gamepad"`                          | Hardware state                                           |
| -------------------------------- | ---------------- | ---------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| Chrome-compatible in-app browser | 150.0.0.0        | API exposed; policy allowed; call returned four slots            | API exposed; policy allowed; call returned four slots | API exposed; policy allowed; call returned four slots | No controller was connected, so all four slots were null |
| Safari                           | 26.5.2 installed | Not run: this environment exposes no controllable Safari session | Not run                                               | Not run                                               | Not run                                                  |
| Firefox                          | Not installed    | Not run                                                          | Not run                                               | Not run                                               | Not run                                                  |

Chrome therefore did not require a permissions-policy attribute for this sandbox. That matches the specification's current default allowlist of `*`. This is an API/policy result, not a claim that hardware input was exercised.

Safari and Firefox remain a manual verification gap. The spike must not be promoted until the same harness is run in both with a physical standard-layout controller, including a button press to satisfy browsers that expose a connected pad only after user interaction.

## Latency

The Chrome harness sent 240 animation-frame-paced messages from the shell into the sandbox and measured receipt using absolute high-resolution timestamps. It also delivered 30 real keyboard presses into the same iframe and measured event dispatch at the listener.

| Path                                  | Samples |    Mean |     p50 |     p95 |
| ------------------------------------- | ------: | ------: | ------: | ------: |
| Keyboard event dispatch inside iframe |      30 | 0.15 ms | 0.10 ms | 0.20 ms |
| Shell `postMessage` into iframe       |     240 | 0.78 ms | 0.80 ms | 1.10 ms |

The measured relay overhead over keyboard dispatch was about 0.63 ms on average. A frame-paced poll adds 0–16.7 ms at 60 Hz, 8.3 ms on average, before the measured bridge cost. The expected added latency is therefore about 8.9 ms on average and under 18 ms near p95.

That final estimate is modeled because no physical controller was connected. A hardware run should calculate `receivedAt - sourceTimestamp` for each changed sample and compare it with the keyboard measurement above.

## Production follow-ups

1. Complete the physical-controller matrix on current Chrome, Firefox, and Safari desktop releases; repeat on Android Chrome and iOS Safari.
2. Add an explicit game-to-shell hello before polling, matching sensing and voice. Silent games must cost nothing.
3. Define the normalized state in a shared bridge contract, including deadzone rules, edge semantics, visibility resets, and disconnect releases.
4. Add the controller source to GameKit `input`; let games use existing logical actions before exposing raw axes or buttons.
5. Let `party` assign controller indices to local slots, preserve keyboard hot-seat fallback, and avoid claiming a slot on an all-released frame.
6. Add remapping and deadzone settings with keyboard, pointer, touch, and accessibility parity.
7. Treat haptics as a separate capability review; never relay arbitrary device identifiers.
8. Add browser integration tests once WebDriver implementations can inject gamepad input consistently.

## Exit state

- Prototype retained behind the development-only flag.
- No iframe sandbox or permissions-policy change.
- No GameKit module added.
- No game changed.
- No production behavior change.
