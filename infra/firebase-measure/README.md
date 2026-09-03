# Measurement-only Hosting config

Answers the two questions FH-02 and FH-08 hang on, which cannot be answered from docs or
from Cloud Run logs: does `Origin` survive a Hosting rewrite, and what does the service
resolve as `request.ip` once an extra proxy hop exists.

**This is not the production config.** It rewrites everything to the live service and ships
no static files, which is what makes it a clean measurement — the only variable is whether
Hosting is in the path. The real `firebase.json` for FH-04 serves `/assets/*` from Hosting
and is a separate piece of work.

Deploy it to a preview channel, which needs no DNS and no custom domain:

```bash
npx firebase-tools login
npx firebase-tools projects:addfirebase gamedevpl     # one-time, if Firebase is not on the project yet
npx firebase-tools hosting:channel:deploy measure --expires 1d --config infra/firebase-measure/firebase.json --project gamedevpl
```

Then compare the two, signed in or with a personal access token:

```bash
curl -s -H "Authorization: Bearer <pat>" https://<service>.run.app/api/diagnostics/proxy
curl -s -H "Authorization: Bearer <pat>" https://<preview-url>/api/diagnostics/proxy
```

`resolvedIp` differing between them is the FH-08 answer; `headers.origin` surviving is the
FH-02 answer. Delete the channel when done: `npx firebase-tools hosting:channel:delete measure`.
