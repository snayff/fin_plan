# Deployment Architecture

## Overview

Finplan deploys to a self-hosted Coolify instance via GitHub Actions. Deployments are triggered automatically on push to the production branch after the CI check jobs pass.

Concrete deployment values (server address, SSH user, internal service ports, webhook URLs, `authorized_keys` contents) are **not** stored in this repository — it is public. They live in the private deployment runbook alongside the other infrastructure credentials. Placeholders such as `<DEPLOY_USER>` below refer to entries in that runbook.

## Why SSH, Not Direct Webhook

Coolify's webhook API listens on an internal-only port that is firewalled from external access. GitHub Actions runners cannot reach it directly — a `curl --fail "$COOLIFY_WEBHOOK_URL"` call will time out with `curl: (28)`.

**Solution:** GitHub Actions SSHs into the server and runs the `curl` command from inside — where the webhook port is accessible via `localhost`.

```
Push to production
  → GitHub Actions (CI passes)
    → SSH into <DEPLOY_HOST> as <DEPLOY_USER>
      → curl the Coolify webhook on its internal port
        → Coolify deploys finplan
```

## Security Design

The deploy SSH key is restricted using a `command=` forced command in the deploy user's `authorized_keys`: the forced command is the single webhook `curl` invocation, combined with the standard lockdown options (`no-pty`, `no-port-forwarding`, `no-X11-forwarding`, `no-agent-forwarding`). The exact line is kept in the private runbook.

This means:

- The key **cannot open a shell** — it can only trigger the one specific curl command
- The Coolify deploy token lives only on the server, never in GitHub secrets
- Even if the private key leaks, an attacker can only trigger a Coolify redeploy

The server's SSH host key is stored in `COOLIFY_HOST_KEY` and written to `known_hosts` before connecting, preventing MITM attacks.

## GitHub Secrets

| Secret             | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| `DEPLOY_SSH_KEY`   | Private key (ed25519) for the restricted deploy user |
| `COOLIFY_HOST_KEY` | Server SSH host key line — written to `known_hosts`  |
| `DEPLOY_USER`      | SSH username for the deploy connection               |
| `DEPLOY_HOST`      | Server address for the deploy connection             |

## CI Workflow (`ci.yml` deploy job)

```yaml
deploy:
  name: Deploy to Coolify
  runs-on: ubuntu-latest
  if: github.event_name == 'push' && github.ref == 'refs/heads/production'
  needs: [lint-and-typecheck, test, check-compile]
  environment: PROD

  steps:
    - name: Set up SSH
      run: |
        mkdir -p ~/.ssh
        echo "${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/deploy_key
        chmod 600 ~/.ssh/deploy_key
        echo "${{ secrets.COOLIFY_HOST_KEY }}" >> ~/.ssh/known_hosts

    - name: Trigger Coolify deploy
      run: ssh -i ~/.ssh/deploy_key -o ConnectTimeout=10 "${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }}"
```

The `needs:` list gates the deploy on the lint/type-check, test, and compile jobs — a direct push to the production branch cannot deploy unless those jobs pass on that push.

## If You Need to Rotate the Key

1. Generate a new ed25519 keypair locally
2. SSH into the server and replace the relevant line in `~/.ssh/authorized_keys` (keep the `command=` prefix — only replace the key material; see the private runbook for the full line)
3. Update `DEPLOY_SSH_KEY` in GitHub secrets
4. Verify with a test push
