# Deploying the live demo

The live demo is one Docker image on Render's free plan, with its database on Neon's free plan.
The image serves the React page and the API from the same address. The deployed copy has its
own empty database, so nothing in it touches the copy on your own machine.

Uploads and short-answer grading spend Anthropic credit, and the app has no accounts. The
demo is therefore locked with an access code: every `/api` call must send it, or the server
answers 401 and the page shows a code form. You share the code inside the link, so a friend
never has to type it.

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
about $0.04. Both models are `claude-opus-5`.

## 3. Web service (Render)

1. Sign in at render.com with GitHub and give Render access to the `study-os` repository.
2. Select **New > Blueprint** and pick the repository. Render reads `render.yaml`.
3. Enter the values it asks for: the three `SPRING_DATASOURCE_*` values and
   `ANTHROPIC_API_KEY`. Render generates `APP_ACCESS_CODE` itself.
4. Select **Apply**. The first build takes several minutes, because it installs the frontend
   and the Maven dependencies from scratch.
5. When the deploy is live, open the service's URL. The code form should appear.

After this, every push to `master` deploys again once CI passes.

## 4. Share it

1. In Render, open the service's **Environment** tab and copy `APP_ACCESS_CODE`.
2. Send this link: `https://<your-service>.onrender.com/#access=<the code>`

The page stores the code in the browser and removes it from the address bar. Anyone who
opens the site without the code sees the form.

## Things to know

- A free Render service stops after 15 minutes without traffic. The next visit starts it
  again, which takes about a minute, and Spring Boot adds its own start time on the free
  plan's small CPU. The first page load after a quiet spell is slow; later ones are not.
- Everyone with the code shares one set of courses and one review schedule.
- To lock out everyone who has the old code, change `APP_ACCESS_CODE` in the Environment
  tab and save. The service redeploys, and old browsers get the code form again.
- Upload a PDF. The app refuses PowerPoint and Word files and tells you to export them to
  PDF first.
