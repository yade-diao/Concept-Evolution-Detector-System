# Deploying

The API, its database and a reverse proxy, on one small server. The proxy
terminates TLS, serves the built frontend, and forwards `/api/*` to the API, so
the page and the API share an origin and no CORS configuration exists anywhere.

Nothing is built on the server. CI builds an image from a commit whose tests
passed, pushes it to GitHub Container Registry, and the server pulls it.

## What it needs

A machine with 1 GB of memory and Docker. The heavy work - the clustering - runs
in the browser, so the server only stores accounts and saved runs.

Any host will do; two that cost a student nothing:

- **DigitalOcean**, whose $200 of credit comes with the GitHub Student
  Developer Pack. A $6/month droplet runs for most of the credit's life.
- **Oracle Cloud Always Free**, which needs no student status and is free
  indefinitely, if the ARM capacity in your region is available when you ask.

## Once, on the server

```sh
# Docker, from Docker's own repository rather than the distribution's.
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # log out and back in

sudo mkdir -p /opt/ced/site && sudo chown -R "$USER" /opt/ced
cd /opt/ced
```

Copy `compose.yml`, `Caddyfile` and `.env.example` from this directory to
`/opt/ced`, then:

```sh
cp .env.example .env && chmod 600 .env
openssl rand -base64 48   # CED_JWT_SECRET
openssl rand -base64 48   # CED_DB_PASSWORD
```

Fill in `.env`, including `CED_DOMAIN`. **Point that domain at this server
before starting the stack**: Caddy answers the ACME challenge on port 80 itself,
and a name that does not resolve yet fails the certificate request and then
waits out a rate limit. The Student Pack includes a year of a Namecheap domain
if you have none.

Then:

```sh
docker compose --env-file .env up -d
docker compose logs -f api      # Flyway migrating, then the port opening
```

If the GHCR package is private, the server needs to authenticate once - the
simplest alternative is to make the package public in the repository's Packages
settings, since the image contains no secrets:

```sh
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
```

## Automatic deployment

`.github/workflows/deploy.yml` runs after `backend` succeeds on `main`: it
copies `compose.yml` and `Caddyfile` up, pulls the new image, restarts, and
waits for the API's health check to pass before reporting success. It never
touches `.env` or `site/`.

Three repository secrets turn it on (Settings → Secrets and variables →
Actions):

| secret | value |
|---|---|
| `DEPLOY_HOST` | the server's hostname or IP |
| `DEPLOY_USER` | the user to ssh as, in the `docker` group |
| `DEPLOY_SSH_KEY` | that user's private key, the whole PEM including its header and footer lines |

Generate a key for this and nothing else:

```sh
ssh-keygen -t ed25519 -N "" -f deploy_key -C "github-actions"
ssh-copy-id -i deploy_key.pub <user>@<server>
# paste deploy_key (the private half) into DEPLOY_SSH_KEY, then delete both files
```

Without those secrets the workflow skips itself and stays green, so a fork does
not inherit a permanently failing job.

## Rolling back

Every build is tagged with its commit SHA as well as `latest`:

```sh
CED_IMAGE_TAG=<sha> docker compose --env-file .env up -d
```

Or run the deploy workflow manually and give it the SHA - it takes a tag as an
input.

## The frontend

Not yet deployed: the React application has no entry point in the repository
yet. When it does, its build output and `datasets/bundled` go into
`/opt/ced/site`, which Caddy already serves, and the deploy workflow gains an
rsync step. Serving the datasets from that origin is deliberate - two of the
eight benchmarks exist at these exact shapes nowhere else, and the public host
of a third sends no CORS headers at all.
