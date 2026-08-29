# First deployment checklist

## Before connecting to the server

- [x] Backend tests and formatting pass locally.
- [x] Frontend lint and production build pass locally.
- [x] Development Owner configuration is excluded from Docker and .NET publish output.
- [x] CI checks Backend, Frontend, and development credential leakage.
- [x] Docker production images build and start successfully.
- [x] Local Production setup, login, post visibility, recreation, health, and backup checks pass.
- [ ] HTTPS termination method is selected.
- [ ] EC2 instance, storage size, and Security Group are finalized.

## On the EC2 instance

```bash
git clone https://github.com/crusthack/blog.git
cd blog
chmod +x deploy/scripts/*.sh
deploy/scripts/create-setup-secret.sh
deploy/scripts/production-preflight.sh
docker compose -f compose.production.yaml up -d --build
```

Only ports 22, 80, and 443 should be considered for public access. Backend port 8080 and Frontend port 3000 must remain internal to the Docker network.

## First-run verification

1. Open `/setup` and create the production Owner with the generated Setup Code.
2. Log in with the production Owner account.
3. Create a draft Markdown post and verify guests cannot read it.
4. Publish the post and verify guests can read it.
5. Restart the Compose stack and verify the Owner and post remain available.
6. Verify `localdev / password` cannot log in.
7. Verify the OpenAPI endpoint is unavailable.
8. Verify all services report `healthy` in `docker compose ps`.

Create a first backup and copy it away from the EC2 instance:

```bash
deploy/scripts/backup-runtime.sh
```

## After Owner creation

- Remove the Backend `secrets` entry and `BLOG_BOOTSTRAP__TOKENFILE` from `compose.production.yaml` in the deployed configuration.
- Recreate the Backend container.
- Delete the Setup Code file securely after confirming setup remains complete.
- Schedule `deploy/scripts/backup-runtime.sh` and store copies outside the EC2 instance before adding real content.
