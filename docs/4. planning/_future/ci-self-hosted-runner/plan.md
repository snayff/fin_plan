# CI: Self-Hosted Runner for Coolify Deploy

## Problem

The deploy job in `ci.yml` currently tries to curl the Coolify webhook from a GitHub-hosted runner. PROD is a local Ubuntu VM accessed only via Cloudflare Tunnel — no ports are publicly exposed. GitHub runners cannot reach it, resulting in `curl: (28) connection timeout`.

## Solution

Replace the GitHub-hosted runner with a **self-hosted GitHub Actions runner** installed on the PROD Ubuntu VM. The runner executes the deploy job locally, so it can curl Coolify's internal webhook port (`http://localhost:<COOLIFY_PORT>/...` — see the private deployment runbook) directly — no ports need exposing.

```
Push to main
  → GitHub Actions (CI passes)
    → Self-hosted runner on PROD VM picks up the deploy job
      → curl http://localhost:<COOLIFY_PORT>/api/v1/deploy/TOKEN
        → Coolify deploys finplan
```

---

## Pre-requisites

- SSH access to the PROD Ubuntu VM
- Admin access to the GitHub repository
- Access to the Coolify dashboard on PROD

---

## Step 1 — Get the Coolify deploy token

1. Open the Coolify dashboard in your browser (via Cloudflare Tunnel)
2. Navigate to the finplan application
3. Find the **Webhooks** section
4. Copy the deploy webhook URL — it will look like:
   ```
   http://localhost:<COOLIFY_PORT>/api/v1/deploy/abc123xyz
   ```
5. Note down the full URL — you will need it in Step 4

---

## Step 2 — Get the runner registration token from GitHub

1. Go to your GitHub repository
2. Click **Settings** → **Actions** → **Runners**
3. Click **New self-hosted runner**
4. Select **Linux** and **x64**
5. GitHub will show a page with commands — **do not run them yet**
6. Find the `config.sh` line and copy the `--token` value (e.g. `ABCDEFGH123...`)

> The token expires after **1 hour** — complete Steps 3–5 within that window.

---

## Step 3 — Install the runner on the PROD Ubuntu VM

SSH into the PROD VM, then run:

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner

curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.322.0/actions-runner-linux-x64-2.322.0.tar.gz

tar xzf ./actions-runner-linux-x64.tar.gz
```

Then configure it, replacing `<OWNER>`, `<REPO>`, and `<TOKEN>` with your values:

```bash
./config.sh \
  --url https://github.com/<OWNER>/<REPO> \
  --token <TOKEN> \
  --unattended \
  --name prod-server \
  --labels self-hosted
```

> `<OWNER>` is your GitHub username or org name. `<REPO>` is `fin_plan`.

---

## Step 4 — Install the runner as a system service

This ensures the runner starts automatically on reboot:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

Verify it is running:

```bash
sudo ./svc.sh status
```

You should see `active (running)`. Also confirm in GitHub: **Settings** → **Actions** → **Runners** — the runner should appear as **Idle**.

---

## Step 5 — Add the Coolify deploy URL as a GitHub secret

1. Go to GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `COOLIFY_DEPLOY_URL`
4. Value: the full URL from Step 1, e.g. `http://localhost:<COOLIFY_PORT>/api/v1/deploy/abc123xyz`
5. Click **Add secret**

---

## Step 6 — Update `ci.yml`

Edit `.github/workflows/ci.yml`. Replace the entire `deploy` job (currently at the bottom of the file) with:

```yaml
deploy:
  name: Deploy to Coolify
  runs-on: self-hosted
  if: github.event_name == 'push'
  environment: PROD

  steps:
    - name: Trigger Coolify deploy
      run: curl --silent --show-error --fail "${{ secrets.COOLIFY_DEPLOY_URL }}"
```

Key changes:

- `runs-on: self-hosted` — picks up the runner installed in Step 3
- No SSH setup steps needed — the runner is already on the PROD VM
- Curls the internal Coolify webhook port via the secret set in Step 5

---

## Step 7 — Verify

1. Push any commit to `main` (or merge a PR)
2. Go to GitHub → **Actions** — the deploy job should appear
3. The **Trigger Coolify deploy** step should complete in under 5 seconds with exit code 0
4. In the Coolify dashboard, a new deployment should appear and succeed
5. Confirm the live app reflects the latest commit

---

## Cleanup

Once verified working:

- Remove the old `COOLIFY_WEBHOOK_URL` and `DEPLOY_SSH_KEY` and `COOLIFY_HOST_KEY` secrets from GitHub (Settings → Secrets) — they are no longer used
- Update `docs/3. architecture/system/deployment.md` to reflect the self-hosted runner approach (replace the SSH section entirely)

---

## If the Runner Goes Offline

If the runner shows as **Offline** in GitHub:

```bash
# SSH into the PROD VM and restart the service
sudo systemctl restart actions.runner.<OWNER>.<REPO>.prod-server.service
```

Or check logs:

```bash
sudo journalctl -u actions.runner.<OWNER>.<REPO>.prod-server.service -f
```
