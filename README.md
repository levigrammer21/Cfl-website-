# CFL Football

A mobile-first public youth football site and Firebase-backed League Office. The front end uses React and Vite. GitHub Pages serves static assets at the repository's default address. Firebase owns staff identity, records, file storage and privileged operations.

## Upload the public review build from a phone

1. Extract **CFL-GitHub-Pages.zip**. It contains a flat set of ready-to-upload website files.
2. In the GitHub repository, open **Add file → Upload files**. Upload the extracted files themselves to the root of `main`. Keep `index.html`, the JS and CSS files, and the SVG files side by side.
3. Open **Settings → Pages**. Choose **Deploy from a branch**, then **main** and **/ (root)**. Save and open the address GitHub reports when deployment finishes. The default project address is normally `https://OWNER.github.io/REPO/`.
4. Share that address for review. Leave the custom domain field blank until the league approves a move.

This build uses published legacy CFL data. It includes schedule and score filters, detail links, standings, playoffs, team and town pages, field directions, the championship archive, public documents, and device-local My Town. League Office opens for staff after the connected build and its Firebase services are deployed. Keep the source ZIP separate from the flat upload.

## Work on the source

Use Node.js 22 and Java 21 or newer for the emulator suite. Extract this source ZIP into its own directory.

```sh
npm ci
npm --prefix functions ci
npm run dev
npm test
npm run test:integration
```

`npm run build` creates the flat preview build in `dist/`. For a connected build, run `VITE_CFL_MODE=cloud npm run build`. Replace the earlier branch deployment's files with the new build as a single commit. GitHub Pages can also build from the full source in a dedicated source repository. Set **Settings → Pages → GitHub Actions** and leave the repository variable `CFL_MODE` unset for review or set it to `cloud` after Firebase activation.

For browser testing with the Firebase emulators, start `npx firebase emulators:start --project demo-cfl` and run `VITE_CFL_MODE=emulator npm run dev` in a second terminal. Use separate test accounts and seed from the operator command below. The integration suite runs the actual callable handlers on local HTTP and connects them to the Auth, Firestore and Storage emulators. It creates temporary test accounts and discards the local state when the emulators shut down.

## Activate Firebase for a connected staging review

The handoff specifies Firebase project `pokemongridiron`. Use a privileged operator account on a trusted machine. The Firebase CLI account and Application Default Credentials are separate login contexts. Use normal CLI login and Google Cloud ADC or an approved equivalent. Keep credentials out of the repo, chat, and website.

1. Confirm ownership, billing, Firestore, Storage, Functions, and the enabled Google and Email/Password providers in Firebase. Check that the CLI is pointed at the intended project. Use `node functions/setup-firebase.mjs inspect pokemongridiron` with ADC to list collection names before writing anything. Review both the existing Firestore rules and Storage rules. Pay particular attention to broad wildcard allows, since Firestore and Storage evaluate overlapping allows as OR conditions.
2. If there is existing non-CFL data, merge only the CFL rule blocks and audit index into the project's existing files. Existing rules, indexes, and hosting settings are project-wide. A permissive rule covering `/cfl/v1/**` defeats the private-data boundary and must be resolved and tested before use. Keep a copy of the deployed configuration. The supplied standalone rules are for a dedicated project with no overlapping application data.
3. Add the default GitHub Pages hostname `OWNER.github.io` under **Firebase Authentication → Settings → Authorized domains**. Use the hostname alone. Uploaded league files are served by the league download function after it checks their publication status. Direct client access to CFL storage is denied.
4. Deploy the namespaced functions and the reviewed rules and indexes. No Firebase Hosting deploy is needed for GitHub Pages. Example for a confirmed dedicated project:

   ```sh
   npx firebase deploy --project pokemongridiron --only functions:cfl,firestore:rules,firestore:indexes,storage
   ```

5. Have the intended owner sign into the connected site's League Office using the verified address specified in the handoff. Find the exact Auth UID in the Firebase console. Only a privileged operator can bootstrap that UID. Run the following with the verified UID and confirm the success text.

   ```sh
   node functions/setup-firebase.mjs bootstrap pokemongridiron VERIFIED_UID --apply
   node functions/setup-firebase.mjs verify pokemongridiron VERIFIED_UID
   node functions/setup-firebase.mjs seed pokemongridiron VERIFIED_UID --apply
   ```

   The setup script verifies the address, UID, enabled status, and Google/password provider. Re-running bootstrap verifies the existing assignment. The seed refuses a populated CFL namespace unless resuming its own migration and never overwrites an existing document. Review its provenance and migration receipt before enabling league staff. A Functions cold start or Firestore index build can briefly delay verification.

6. With the connected build live, refresh the owner session and verify the Super Admin badge. Test a distinct Admin, two opposing Directors and a scoped Coach. Verify that an unauthenticated browser can view public pages and receives permission-denied for direct private requests. Complete the rollout checklist below before using real roster data.

The GitHub Pages site may be public even during review. Firestore and callable authorization are the privacy boundary for private records. Public HTML and bundles contain only client configuration and the public legacy dataset. No roster or staff assignment is part of the review build.

## Staff workflows

- **Season setup.** In League records, create the draft season and its divisions, then assign towns, teams and venues. Set conferences and tiebreakers based on league approval. Archive the old season before activating the new one. Keep stable IDs and use a new season's records for new teams. Archive corrections require an audit note.
- **Scheduling.** Create standalone games or link grade games to a town event. Enter Central Time and an occupancy duration and use a consistent field identifier. Unknown kickoff times can remain blank. CSV import previews row-level errors, checks conflicts again on the server, and creates up to 40 games atomically. Download a template or export current records from the Games management screen. An approved director request records the decision, and an Admin applies the schedule edit separately.
- **Scoring.** A Director reports on behalf of a scoped side. A different Director assigned only to the opposing side confirms or disputes. An Admin resolves disputes and can enter, correct, or reset results with a reason. Pending scores stay private, even when an owner chooses to publish pending status. Standings read one official score per game and are recomputed on page load. No cumulative record is edited.
- **Playoffs.** Create a bracket per grade division, then schedule its games by round. Enter seed labels, assign teams, and link subsequent home/away slots to earlier feeder games. A slot can be a bye when the remaining team is known. An official outcome advances the winner. Correct downstream scores in reverse round order if an earlier correction changes which team advances.
- **Private rosters.** Open Rosters and choose a team. Admins can edit, and Coaches and Directors have read-only access to their scopes. Exports are authorized server-side, logged and marked with the exporting address and time. Do not upload completed roster forms through public Documents.
- **Staff access.** Search by email, choose a role and its scopes, and save the assignment. For a new user this records a pending invitation that is claimed by signing in with the verified address. Share the League Office link with staff through your usual channel. Assignment and revocation are enforced on subsequent requests even when someone still has a signed-in browser.
- **Public documents.** Use an HTTPS resource link or upload a PDF, PNG or JPEG up to 5 MB. Publication controls file access. Public documents should contain league materials appropriate for visitors.

## Legacy import and open records

The import is scoped to publicly published material on `cfl1.org`. Source links are retained on records. The 2026 rules identify the member programs, conferences, postseason seeding format and differential points. Grade-level score blocks are matched using their on-page grade columns and cross-checked against the town event pairings. Dates without a published kickoff remain date-only. The published 2026 playoff pairings and scheduled later rounds are included. The legacy site does not provide the later results used here, so the related champions are shown as unknown. The published 2022 grades 5–6 champion is blank and remains unknown. A published 2026 forfeit is preserved as a forfeit and excluded from rankings while league policy is unconfigured. Unresolved tiebreakers share rank and any required coin flip is recorded through the league's authorized seeding decision. Contact names or phone numbers, coach details, and youth rosters were not imported.

To regenerate the source-backed fixture from a downloaded legacy score page, use Python with `lxml` and run `python scripts/migrate-public.py PATH_TO_SCORE_HTML > fixtures/legacy.json`. Review provenance and run tests before deploying a refreshed import. The town accent colors and CFL shield are review branding choices.

## Rollout and recovery

- Compare the imported 2026 scores and bracket with the official scorebook. Fill in verified semifinal and championship results, and approve tiebreakers, forfeits, and public contacts.
- Complete a real-project smoke test for Google sign-in, claim/revoke, direct-rule denial, a dispute and correction, Storage upload/download, and Pages deployment from the repository subpath. Use synthetic rosters for these checks.
- Enable Firestore scheduled backups or managed exports and configure an operator-only backup bucket. Restrict access and retention to protect youth data. Back up Storage separately, with versioning or the approved object backup policy. Use Auth's supported export separately and treat it as privileged.
- Test restoration in a separate approved project. Compare role, roster, audit, schedule, and projection counts. Reconcile published projections with source records, confirm rules and sign-in, then resume writes. Keep the prior static Pages build or commit available for rollback.
- Monitor callable errors, denied requests, function latency and quota in Firebase and Cloud Logging. The site runs without third-party analytics. Privileged mutations have a per-account limit and an audit trail. Review storage for unpublished files from failed or replaced uploads under the league's retention policy.
- Do not switch production DNS until the league has approved the staging site and confirmed deployment, identity and migrated data.
