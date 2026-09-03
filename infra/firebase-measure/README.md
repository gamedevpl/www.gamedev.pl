# Measurement-only Hosting config

Answers the two questions FH-02 and FH-08 hang on, which no document settles and Cloud Run
logs cannot: does `Origin` survive a Hosting rewrite, and what does the service resolve as
`request.ip` once an extra proxy hop exists.

**Not the production config.** Everything rewrites to the live service and no static files
ship, so the only variable is whether Hosting sits in the path. FH-04's `firebase.json`
serves `/assets/*` from Hosting and is separate work.

## Run it from this directory

Paths in `firebase.json` resolve against the directory holding it, so `cd` here rather than
passing `--config` — one less thing to get wrong:

```bash
cd infra/firebase-measure
npx firebase-tools login
npx firebase-tools projects:addfirebase gamedevpl   # skip if Firebase is already on the project
npx firebase-tools hosting:sites:create gamedevpl   # "could not find sites for project" means this step
npx firebase-tools hosting:channel:deploy measure --expires 1d
```

`hosting:sites:create` is the step that is easy to miss: a Google Cloud project can be known
to Firebase and still have no Hosting site, and the deploy then fails with _"could not find
sites for project"_. Site IDs live in a global namespace, so if `gamedevpl` is taken pick
another and set it as `hosting.site` here.

Deploying to a **preview channel** needs no DNS and no custom domain, and does not put
Hosting in front of `www.gamedev.pl` — it serves on a throwaway `*.web.app` URL. Nothing
about production changes until a custom domain is attached, which is FH-05.

## Then compare the two paths

Signed in, or with a personal access token:

```bash
curl -s -H "Authorization: Bearer <pat>" https://<service>.run.app/api/diagnostics/proxy
curl -s -H "Authorization: Bearer <pat>" https://<preview-url>/api/diagnostics/proxy
```

- `resolvedIp` differing between them is the **FH-08** answer — and if the Hosting one is not
  the caller's own address, no `trustProxy` hop count fixes it and the app must read whichever
  header does carry the client.
- `headers.origin` surviving is the **FH-02** answer.

Clean up when done: `npx firebase-tools hosting:channel:delete measure`.
