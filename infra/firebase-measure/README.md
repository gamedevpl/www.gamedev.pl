# Measurement-only Hosting config

Answers two questions that no document settles and Cloud Run logs cannot: does `Origin`
survive a Hosting rewrite, and what does the service resolve as `request.ip` once an extra
proxy hop exists in front of it.

**Not the production config.** The one static file, `public/index.html`, is a deploy
marker: Hosting matches static files before rewrites, so it answers at `/` and confirms the
channel is live. Every other path, `/api/*` included, rewrites to the live service, so the
only variable on the measured routes is whether Hosting sits in the path. Serving real
assets from Hosting is separate work with its own config.

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
about production changes until a custom domain is attached, which is a later step.

## Then compare the two paths

Signed in, or with a personal access token. `curl` sends no `Origin` of its own, so pass one
explicitly — otherwise both paths report `null` and the comparison proves nothing:

```bash
curl -s -H "Authorization: Bearer <pat>" -H "Origin: https://www.gamedev.pl" \
  https://<service>.run.app/api/diagnostics/proxy
curl -s -H "Authorization: Bearer <pat>" -H "Origin: https://www.gamedev.pl" \
  https://<preview-url>/api/diagnostics/proxy
```

Repeat the second one with `-H "Origin: https://evil.example"`: a foreign origin must not
come back allowed, or the check being designed around it is worthless.

- `headers.origin` surviving the rewrite is the first answer.
- `resolvedIp` differing between the two paths is the second. Read it together with
  `headers['x-forwarded-for']` before concluding anything: if the echoed chain still
  contains the caller's real address, a larger `trustProxy` hop count reaches it and that is
  the fix. Only when the chain no longer carries the caller at all must the app read
  whichever vendor header does.
