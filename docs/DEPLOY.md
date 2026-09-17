# Deploying the live demo

The live demo is one Docker image on Render's free plan, with its database on Neon's free plan.
The image serves the React page and the API from the same address. The deployed copy has its
own empty database, so nothing in it touches the copy on your own machine.

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

You do not need to create any tables. The app creates its schema on first start.

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
2. Open `https://<your-service>.onrender.com/#invite=<the code>` and create your own account.
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
