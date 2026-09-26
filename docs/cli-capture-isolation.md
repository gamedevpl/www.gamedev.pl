# Local capture isolation

A local capture uses a temporary browser profile and the Chromium sandbox.
The rendered game remains in an opaque-origin sandboxed iframe.

Every document, including an out-of-process iframe, must receive capture's
network restrictions before its scripts run. Peer connections are unavailable
inside capture documents; regular game rendering and PNG capture remain usable.

Verification must include a real browser and a local UDP listener. A game that
attempts a peer connection must produce no STUN traffic, while capture still
returns a valid PNG. Protocol mocks alone do not establish network isolation.
