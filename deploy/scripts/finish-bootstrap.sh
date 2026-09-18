#!/usr/bin/env bash
set -euo pipefail

readonly app_root="/srv/blog"
readonly marker="$app_root/shared/bootstrap-enabled"
readonly setup_secret="$app_root/shared/secrets/owner-bootstrap-token"
readonly current_release="$app_root/current"
readonly deployment_configuration="/etc/blog/deploy.env"
readonly deployment_lock="/run/lock/blog-deploy.lock"

[[ $EUID -eq 0 ]] || { echo "finish bootstrap must run as root" >&2; exit 1; }
command -v flock >/dev/null 2>&1 \
    || { echo "finish bootstrap requires flock" >&2; exit 1; }
exec 9>"$deployment_lock"
flock -n 9 \
    || { echo "another deployment or bootstrap update is already in progress" >&2; exit 1; }
[[ -L $current_release ]] || { echo "current release is not configured" >&2; exit 1; }

# shellcheck source=/dev/null
source "$deployment_configuration"
: "${BLOG_CLOUDFLARE:=true}"

compose_arguments=(-f compose.production.yaml)
if [[ $BLOG_CLOUDFLARE == "true" ]]; then
    compose_arguments+=(-f compose.cloudflare.yaml)
fi

cd "$current_release"
setup_status=$(docker compose "${compose_arguments[@]}" exec -T backend \
    curl --fail --silent http://127.0.0.1:8080/api/setup/status)
echo "$setup_status" | grep -q '"requiresSetup":false' \
    || { echo "Owner setup is not complete; bootstrap remains enabled." >&2; exit 1; }

rm -f -- "$marker" "$setup_secret"
docker compose "${compose_arguments[@]}" up -d --force-recreate backend
echo "Owner bootstrap has been disabled and its Setup Code removed."
