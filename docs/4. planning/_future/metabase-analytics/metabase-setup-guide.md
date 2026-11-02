# Metabase Analytics Setup Guide

**Purpose:** Step-by-step instructions to deploy a self-hosted Metabase instance on Coolify and build a finplan user activity dashboard. No frontend telemetry is added — all data comes from the existing Postgres database.

**Audience:** finplan developer / operator with Coolify admin access.

**Time estimate:** 45–60 minutes end to end.

---

## Overview

Metabase is an open-source analytics UI that connects directly to your Postgres database. The setup has three phases:

1. Create a read-only database user so Metabase can never modify finplan data
2. Deploy Metabase on Coolify (with its own small Postgres for config storage)
3. Build the dashboard with the queries below

---

## Phase 1 — Create a Read-Only Postgres User

This step ensures Metabase can only read data, never write or delete it.

### 1.1 Connect to your production Postgres instance

SSH into your server and open a psql session as the superuser:

```bash
ssh your-server
docker exec -it <postgres-container-name> psql -U postgres
```

To find the container name run: `docker ps | grep postgres`

### 1.2 Create the read-only role

Run these SQL commands inside psql:

```sql
-- Create the user (choose a strong password)
CREATE USER metabase_reader WITH PASSWORD 'your-strong-password-here';

-- Grant connection rights to the finplan database
GRANT CONNECT ON DATABASE finplan TO metabase_reader;

-- Grant usage on the public schema
GRANT USAGE ON SCHEMA public TO metabase_reader;

-- Grant SELECT on all current tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO metabase_reader;

-- Ensure SELECT is granted on any future tables automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO metabase_reader;
```

> **Note:** Replace `finplan` with the actual database name if different. To check: `\l` in psql lists all databases.

### 1.3 Verify the user works

```bash
psql -U metabase_reader -d finplan -h localhost -c "SELECT count(*) FROM users;"
```

If this returns a count (even 0) without an error, the user is correctly configured.

---

## Phase 2 — Deploy Metabase on Coolify

Metabase needs its own database to store its configuration (dashboards, questions, user accounts). You will create a small dedicated Postgres database for this, then deploy Metabase itself.

### 2.1 Create a Metabase config database in Coolify

1. Open your Coolify dashboard.
2. Navigate to **Resources** → **New Resource** → **Database** → **PostgreSQL**.
3. Configure it:
   - **Name:** `metabase-db`
   - **Version:** 15 (or latest)
   - Leave all other settings as defaults.
4. Click **Deploy**. Wait for it to start.
5. Once running, go to the database resource and copy the **Internal Connection URL** — it will look like: `postgresql://postgres:<password>@metabase-db:5432/postgres`

### 2.2 Deploy Metabase

1. In Coolify, navigate to **Resources** → **New Resource** → **Docker Image**.
2. Set the image to: `metabase/metabase:latest`
3. Set the exposed port to: `3000`
4. Under **Environment Variables**, add:

   ```
   MB_DB_TYPE=postgres
   MB_DB_DBNAME=postgres
   MB_DB_PORT=5432
   MB_DB_USER=postgres
   MB_DB_PASS=<password from step 2.1>
   MB_DB_HOST=metabase-db
   MB_SITE_URL=https://metrics.example.com
   JAVA_TIMEZONE=Europe/London
   ```

   Replace `metrics.example.com` with whatever subdomain you want Metabase to live at.

5. Under **Network**, ensure the service is on the `coolify` network (same network as finplan and the metabase-db).

6. Under **Domain**, set the domain to your chosen subdomain (e.g., `metrics.example.com`). Coolify/Traefik will handle SSL automatically.

7. Click **Deploy**. Metabase takes 2–3 minutes to start on first run.

### 2.3 Restrict access (recommended)

Metabase has its own login system, but the admin UI should not be publicly crawlable. Choose one:

**Option A — IP restriction via Traefik middleware (strongest)**

In Coolify, under the Metabase service's advanced labels, add a Traefik IP whitelist. Example (replace with your home IP):

```
traefik.http.middlewares.metabase-ipwhitelist.ipwhitelist.sourcerange=YOUR.HOME.IP.ADDRESS/32
traefik.http.routers.metabase.middlewares=metabase-ipwhitelist
```

**Option B — Leave Metabase's own auth as the only gate**

Metabase requires login by default. This is acceptable if you set a strong admin password in the next step.

---

## Phase 3 — Initial Metabase Configuration

### 3.1 Complete the setup wizard

1. Navigate to `https://metrics.example.com` (or wherever you deployed Metabase).
2. Click **Get started**.
3. Create the admin account:
   - Use an email address you control.
   - Use a strong, unique password — store it in your password manager.
4. On the **Add your data** screen, click **Add a database** and fill in:
   - **Database type:** PostgreSQL
   - **Display name:** finplan production
   - **Host:** the internal hostname of your finplan Postgres container (check with `docker ps`)
   - **Port:** 5432
   - **Database name:** finplan (or your actual DB name)
   - **Username:** `metabase_reader` (the read-only user from Phase 1)
   - **Password:** the password you set in step 1.2
   - Leave SSL settings as-is for internal Docker networking.
5. Click **Save** and wait for the connection test to pass.
6. Click through the remaining wizard steps and finish setup.

### 3.2 Verify the connection

In Metabase, go to **Browse data** → **finplan production**. You should see all your tables listed (users, households, audit_logs, etc.). Click any table to confirm you can see data.

---

## Phase 4 — Build the Dashboard

You will create a collection of **Questions** (individual queries) and then pin them to a single **Dashboard**.

### 4.1 Create a new Collection

1. Go to **Browse** → **Our analytics** → **New** → **Collection**.
2. Name it: `finplan — User Analytics`

### 4.2 Create each Question

For each question below:

1. Go to **New** → **Question**.
2. Select **finplan production** as the data source.
3. Switch to **Native query** (SQL) mode using the toggle in the top-right.
4. Paste the SQL.
5. Run it, confirm results look correct.
6. Click **Save**, give it the name shown, and save into the `finplan — User Analytics` collection.

---

#### Question 1 — Total Users

**Name:** Total Users

```sql
SELECT COUNT(*) AS total_users
FROM users;
```

_Display as:_ Single number (Big Number visualisation)

---

#### Question 2 — Total Households

**Name:** Total Households

```sql
SELECT COUNT(*) AS total_households
FROM households;
```

_Display as:_ Single number

---

#### Question 3 — Active Users (Last 7 Days)

Active = made at least one authenticated API call (refresh token used) in the past 7 days.

**Name:** Active Users — Last 7 Days

```sql
SELECT COUNT(DISTINCT user_id) AS active_users_7d
FROM refresh_tokens
WHERE last_used_at >= NOW() - INTERVAL '7 days';
```

_Display as:_ Single number

---

#### Question 4 — Active Users (Last 30 Days)

**Name:** Active Users — Last 30 Days

```sql
SELECT COUNT(DISTINCT user_id) AS active_users_30d
FROM refresh_tokens
WHERE last_used_at >= NOW() - INTERVAL '30 days';
```

_Display as:_ Single number

---

#### Question 5 — New Signups This Month

**Name:** New Signups — This Month

```sql
SELECT COUNT(*) AS new_signups
FROM users
WHERE created_at >= DATE_TRUNC('month', NOW());
```

_Display as:_ Single number

---

#### Question 6 — Monthly Signup Growth

**Name:** Signups by Month

```sql
SELECT
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*)                         AS new_users
FROM users
GROUP BY 1
ORDER BY 1;
```

_Display as:_ Line chart — X axis: month, Y axis: new_users

---

#### Question 7 — Daily Active Users (Last 30 Days)

**Name:** Daily Active Users — Last 30 Days

```sql
SELECT
  DATE_TRUNC('day', last_used_at) AS day,
  COUNT(DISTINCT user_id)          AS active_users
FROM refresh_tokens
WHERE last_used_at >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;
```

_Display as:_ Line chart — X axis: day, Y axis: active_users

---

#### Question 8 — Per-User Activity Table

Shows each user with their last-active date, household, and session count. No passwords or tokens are exposed.

**Name:** User Activity Table

```sql
SELECT
  u.name                              AS user_name,
  u.created_at                        AS joined_at,
  MAX(rt.last_used_at)                AS last_active,
  COUNT(DISTINCT rt.id)               AS total_sessions,
  COUNT(DISTINCT d.id)                AS device_count,
  COALESCE(h.name, '—')              AS active_household,
  COUNT(DISTINCT hm.household_id)     AS household_memberships
FROM users u
LEFT JOIN refresh_tokens rt  ON rt.user_id = u.id
LEFT JOIN devices d          ON d.user_id = u.id
LEFT JOIN households h       ON h.id = u.active_household_id
LEFT JOIN household_members hm ON hm.user_id = u.id
GROUP BY u.id, u.name, u.created_at, h.name
ORDER BY last_active DESC NULLS LAST;
```

_Display as:_ Table

---

#### Question 9 — Household Size Distribution

**Name:** Household Size Distribution

```sql
SELECT
  member_count,
  COUNT(*) AS households
FROM (
  SELECT household_id, COUNT(*) AS member_count
  FROM household_members
  GROUP BY household_id
) sub
GROUP BY member_count
ORDER BY member_count;
```

_Display as:_ Bar chart — X axis: member_count, Y axis: households

---

#### Question 10 — Top Audit Log Actions (Last 30 Days)

Shows what users are actually doing in the app.

**Name:** Top Actions — Last 30 Days

```sql
SELECT
  action,
  COUNT(*) AS occurrences
FROM audit_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY action
ORDER BY occurrences DESC
LIMIT 20;
```

_Display as:_ Bar chart (horizontal) — X axis: occurrences, Y axis: action

---

#### Question 11 — Households With No Activity in 30 Days

Useful for spotting churned or abandoned accounts.

**Name:** Inactive Households (30+ Days)

```sql
SELECT
  h.name                  AS household_name,
  h.created_at            AS created_at,
  MAX(rt.last_used_at)    AS last_member_active
FROM households h
JOIN household_members hm ON hm.household_id = h.id
JOIN users u              ON u.id = hm.user_id
LEFT JOIN refresh_tokens rt ON rt.user_id = u.id
GROUP BY h.id, h.name, h.created_at
HAVING MAX(rt.last_used_at) < NOW() - INTERVAL '30 days'
    OR MAX(rt.last_used_at) IS NULL
ORDER BY last_member_active ASC NULLS FIRST;
```

_Display as:_ Table

---

### 4.3 Build the Dashboard

1. Go to **New** → **Dashboard**.
2. Name it: `finplan — User Activity`
3. Save it into the `finplan — User Analytics` collection.
4. Click **Edit** on the dashboard.
5. Use **Add a question** to add each question created above. Suggested layout:

```
[ Total Users ]  [ Total Households ]  [ Active 7d ]  [ Active 30d ]  [ New This Month ]
[          Monthly Signup Growth (line chart, full width)                              ]
[          Daily Active Users — Last 30 Days (line chart, full width)                 ]
[ Top Actions — Last 30 Days (bar) ]   [ Household Size Distribution (bar)            ]
[          User Activity Table (full width)                                            ]
[          Inactive Households (full width)                                            ]
```

6. Click **Save**.

### 4.4 Set auto-refresh

On the saved dashboard, click the clock icon (⏱) in the top-right and set **Auto-refresh** to **Every 60 minutes**. The dashboard will stay current without manual refreshes.

---

## Phase 5 — Ongoing Maintenance

### Updating Metabase

Metabase releases updates regularly. To update:

1. In Coolify, go to the Metabase service.
2. Pull the latest image and redeploy.
3. Metabase migrates its own config database automatically.

### Adding new questions

As finplan adds features, new tables or audit log actions will appear. Add new questions to the collection at any time using the same SQL approach above.

### Backup

The Metabase config database (`metabase-db`) stores all your saved questions and dashboards. Include it in your standard Postgres backup routine. The finplan production database already contains all the analytics data (no separate backup needed for that).

---

## Troubleshooting

| Symptom                               | Check                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Metabase won't start                  | Check Coolify logs for the Metabase container; ensure `MB_DB_*` env vars are correct        |
| Can't connect to finplan DB           | Confirm `metabase_reader` user exists; confirm both containers are on the `coolify` network |
| Tables not visible                    | Run `GRANT SELECT ON ALL TABLES IN SCHEMA public TO metabase_reader;` again in psql         |
| "permission denied" errors in queries | Specific table missing from grant — run `\dp tablename` in psql to check                    |
| Dashboard shows no data               | Check question individually; confirm finplan has users registered                           |
