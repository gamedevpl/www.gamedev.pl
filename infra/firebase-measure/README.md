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

Nothing here carries a trailing `#` comment. Interactive zsh does not treat `#` as a
comment unless `INTERACTIVE_COMMENTS` is set, so an annotated command line pasted into it
arrives as extra arguments and the CLI answers "Too many arguments".

```bash
cd infra/firebase-measure
npx firebase-tools login
```

Add Firebase to the Google Cloud project. Needed once, and needed even though the project
already exists — a plain GCP project is not a Firebase project, and until this runs every
Hosting call answers "404, Requested entity was not found":

```bash
npx firebase-tools projects:addfirebase gamedevpl
```

Create the Hosting site. A Firebase project can still have no site, which is the
"could not find sites for project" error. Site IDs are a global namespace, so if
`gamedevpl` is taken pick another and set it as `hosting.site` in `firebase.json`:

```bash
npx firebase-tools hosting:sites:create gamedevpl
```

Deploy to a preview channel:

```bash
npx firebase-tools hosting:channel:deploy measure --expires 1d
```

Read the two errors as a ladder: a 404 on the project means the first command is missing,
"no sites" means the second. Both need enough rights on the project (owner, or Firebase
admin).

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
