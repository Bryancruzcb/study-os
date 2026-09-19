# Deploying the live demo

The live demo is one Docker image on Render's free plan, with its database on Neon's free plan.
The image serves the React page and the API from the same address. The deployed copy has its
own empty database, so nothing in it touches the copy on your own machine.

The public demo is at https://study-os-7o9j.onrender.com. Sign-up still needs the invite
code from that service's Render Environment tab (see §4).

Everyone who uses the demo has their own account, and an account sees only its own courses.
Uploads and short-answer grading spend Anthropic credit, so creating an account needs an invite
code. You share the code inside the link, so a friend never has to type it.

## 1. Database (Neon)

1. Sign in at neon.tech and create a project. Choose the AWS US West (Oregon) region, the
   same region as Render's default, so the app and the database are close together.
2. Open **Connect**. Neon shows a URL like this:
   `postgresql://neondb_owner:PASSWORD@ep-example-123456.us-west-2.aws.neon.tech/neondb?sslmode=require`
3. Split that URL into the three values Spring reads:
   - `SPRING_DATASOURCE_URL`: `jdbc:postgresql://ep-example-123456.us-west-2.aws.neon.tech/neondb?sslmode=require`
   - `SPRING_DATASOURCE_USERNAME`: `neondb_owner`
   - `SPRING_DATASOURCE_PASSWORD`: the password from the URL

You do not need to create any tables. Flyway applies V1 on an empty database; an existing database is baselined and left as-is.

## 2. API key with a spending cap (Anthropic)

Use a separate key for the demo. Then you can cap what the demo spends, and revoke the key
without breaking your local copy.

1. In the Claude Console, open **Settings > Workspaces** and create a workspace named
   `study-os-demo`.
2. On that workspace's **Limits** tab, set a monthly spend limit, for example $5. When the
   limit is reached, API calls fail with a 429 error and stop costing money.
3. Create an API key inside that workspace. Copy it now, because the Console shows it once.

As a guide, ingesting a 50-page deck costs about $0.80 and grading one short answer costs
about $0.04. Both models are `claude-opus-5`. Every account spends from this one key, so the
spend limit covers all of them together.

## 3. Web service (Render)

1. Sign in at render.com with GitHub and give Render access to the `study-os` repository.
2. Select **New > Blueprint** and pick the repository. Render reads `render.yaml`.
3. Enter the values it asks for: the three `SPRING_DATASOURCE_*` values and
   `ANTHROPIC_API_KEY`. Render generates `APP_INVITE_CODE` itself.
4. Select **Apply**. The first build takes several minutes, because it installs the frontend
   and the Maven dependencies from scratch.
5. When the deploy is live, open the service's URL. The sign-in form should appear.

After this, every push to `master` deploys again once CI passes.

## 4. Make your account, then share the link

1. In Render, open the service's **Environment** tab and copy `APP_INVITE_CODE`.
2. Open `https://study-os-7o9j.onrender.com/#invite=<the code>` (or
   `https://<your-service>.onrender.com/#invite=<the code>` for your own deploy) and create
   your own account.
3. Send your friends the same link. It opens on **Create account** with the invite code
   already filled in. Each friend picks a username and a password and starts with no courses.

The page removes the invite code from the address bar. After that, signing in needs only a
username and password.

## Things to know

- A free Render service stops after 15 minutes without traffic. The next visit starts it
  again, which takes about a minute, and Spring Boot adds its own start time on the free
  plan's small CPU. The first page load after a quiet spell is slow; later ones are not.
- Sign-ins last 14 days and survive the service stopping, because sessions are stored in
  the database.
- A friend who forgets their password can reset it from the sign-in form. On the public host
  the invite code is required for the first step, the same gate as creating an account. There
  is no email: the page keeps a one-time code for that visit and then asks for a new password.
- To stop new sign-ups, change `APP_INVITE_CODE` in the Environment tab and save. Accounts
  that already exist keep working.
- Upload a PDF. The app refuses PowerPoint and Word files and tells you to export them to
  PDF first.

## Schema and backups

Hibernate no longer updates the schema on boot. Flyway applies
`backend/src/main/resources/db/migration/`. The first file is a baseline of the tables
that used to be created with `ddl-auto=update`.

- A new empty database (local compose, a fresh Neon project) runs V1 and is done.
- The existing demo database already has those tables. Flyway sees a non-empty schema
  with no history table, baselines it at version 1, and leaves the rows alone.
- Later schema changes are new `V2__...sql` files. Do not edit V1.

### Weekly dump

Workflow `.github/workflows/backup.yml` runs every Sunday. It no-ops until this
repository secret exists:

1. In Neon, copy the connection string (the `postgresql://...` URL, not the JDBC one).
2. GitHub → study-os → Settings → Secrets and variables → Actions → New repository secret.
3. Name `NEON_DATABASE_URL`, paste the URL.
4. Actions → Backup Neon → Run workflow, once, to confirm an artifact appears.

Restore on a throwaway database, never onto the live one first:

    pg_restore --no-owner --no-acl --dbname="$NEON_DATABASE_URL" studyos-YYYYMMDD.dump

Artifacts expire after 90 days.

### Uptime

`.github/workflows/uptime.yml` curls `https://study-os-7o9j.onrender.com/api/ping` every
six hours and waits through a free-tier cold start. A red run means the demo did not
answer 200 after about three minutes.

### Protect master

GitHub → Settings → Branches → Add branch protection rule for `master`: require the
`CI` workflow to pass, and disallow force pushes. Render already waits on checks;
protection stops a push that skipped them.
