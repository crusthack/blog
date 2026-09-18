#!/usr/bin/env bash
set -euo pipefail

readonly app_root="/srv/blog"
readonly releases_directory="$app_root/releases"
readonly shared_directory="$app_root/shared"
readonly archive_directory="/var/tmp"
readonly deployment_configuration="/etc/blog/deploy.env"
readonly deployment_lock="/run/lock/blog-deploy.lock"

fail() {
    echo "blog deploy: $*" >&2
    exit 1
}

[[ $EUID -eq 0 ]] || fail "this command must run as root"
[[ $# -eq 1 ]] || fail "usage: deploy-blog <40-character-commit-sha>"

readonly commit_sha="$1"
[[ $commit_sha =~ ^[0-9a-f]{40}$ ]] || fail "invalid commit SHA"

command -v flock >/dev/null 2>&1 || fail "flock is required to serialize deployments"
exec 9>"$deployment_lock"
flock -n 9 || fail "another deployment is already in progress"

readonly archive_path="$archive_directory/blog-$commit_sha.tar.gz"
readonly release_path="$releases_directory/$commit_sha"
readonly incoming_path="$releases_directory/.incoming-$commit_sha-$$"
readonly current_link="$app_root/current"

[[ -f $deployment_configuration && ! -L $deployment_configuration ]] \
    || fail "missing $deployment_configuration"

# shellcheck source=/dev/null
source "$deployment_configuration"

: "${BLOG_PUBLIC_URL:=https://crusthack.com}"
: "${BLOG_CLOUDFLARE:=true}"
: "${BLOG_KEEP_RELEASES:=5}"

[[ $BLOG_CLOUDFLARE == "true" || $BLOG_CLOUDFLARE == "false" ]] \
    || fail "BLOG_CLOUDFLARE must be true or false"
[[ $BLOG_KEEP_RELEASES =~ ^[1-9][0-9]*$ ]] || fail "BLOG_KEEP_RELEASES must be a positive integer"
[[ -f $archive_path && ! -L $archive_path ]] || fail "release archive not found: $archive_path"

release_preexists=false
if [[ -e $release_path ]]; then
    [[ -d $release_path && ! -L $release_path ]] || fail "existing release path is invalid"
    release_preexists=true
fi

previous_release=""

cleanup_incoming() {
    if [[ -d $incoming_path && $incoming_path == "$releases_directory/".incoming-* ]]; then
        rm -rf -- "$incoming_path"
    fi
}
trap cleanup_incoming EXIT

install -d -m 0755 "$releases_directory"
install -d -m 0700 "$shared_directory/secrets" "$shared_directory/backups"

candidate_path="$release_path"
if [[ $release_preexists == "false" ]]; then
    tar -tzf "$archive_path" | awk '
        /^\// || /(^|\/)\.\.($|\/)/ { invalid=1 }
        END { exit invalid ? 1 : 0 }
    ' || fail "archive contains an unsafe path"

    install -d -m 0755 "$incoming_path"
    tar --no-same-owner --no-same-permissions -xzf "$archive_path" -C "$incoming_path"
    [[ ! -e $incoming_path/secrets ]] || fail "release archive unexpectedly contains secrets"
    ln -s "$shared_directory/secrets" "$incoming_path/secrets"
    candidate_path="$incoming_path"
fi

[[ -f $candidate_path/compose.production.yaml ]] || fail "compose.production.yaml is missing"
[[ -f $candidate_path/deploy/scripts/production-preflight.sh ]] || fail "production preflight is missing"
[[ -f $candidate_path/deploy/scripts/deploy-release.sh ]] || fail "release deploy script is missing"
[[ -f $candidate_path/deploy/scripts/finish-bootstrap.sh ]] || fail "bootstrap completion script is missing"

if [[ -L $current_link ]]; then
    previous_release=$(readlink -f "$current_link")
    [[ $previous_release == "$releases_directory/"* ]] || fail "current link points outside releases"
    if [[ -x $previous_release/deploy/scripts/backup-runtime.sh ]]; then
        BACKUP_DIRECTORY="$shared_directory/backups" \
            "$previous_release/deploy/scripts/backup-runtime.sh"
    else
        BACKUP_DIRECTORY="$shared_directory/backups" \
            sh "$previous_release/deploy/scripts/backup-runtime.sh"
    fi
fi

compose_arguments=(-f compose.production.yaml)
preflight_arguments=()
if [[ $BLOG_CLOUDFLARE == "true" ]]; then
    compose_arguments+=(-f compose.cloudflare.yaml)
    preflight_arguments+=(--cloudflare)
fi
if [[ -f $shared_directory/bootstrap-enabled ]]; then
    compose_arguments+=(-f compose.bootstrap.yaml)
    preflight_arguments+=(--bootstrap)
fi

(cd "$candidate_path" && sh deploy/scripts/production-preflight.sh "${preflight_arguments[@]}")

if [[ $release_preexists == "false" ]]; then
    mv -- "$incoming_path" "$release_path"
fi
trap - EXIT
ln -sfn -- "$release_path" "$current_link"

deploy_stack() {
    local selected_release="$1"
    (cd "$selected_release" && docker compose "${compose_arguments[@]}" up -d --build --remove-orphans)
}

if ! deploy_stack "$release_path"; then
    if [[ -n $previous_release && -d $previous_release ]]; then
        ln -sfn -- "$previous_release" "$current_link"
        deploy_stack "$previous_release" || true
    fi
    fail "container deployment failed; previous release was restored when available"
fi

healthy=false
for _ in $(seq 1 30); do
    if [[ $BLOG_CLOUDFLARE == "true" ]]; then
        if curl --fail --silent --show-error --insecure \
            --resolve "crusthack.com:443:127.0.0.1" \
            "https://crusthack.com/api/health" >/dev/null \
            && curl --fail --silent --show-error --insecure \
                --resolve "crusthack.com:443:127.0.0.1" \
                "https://crusthack.com/" >/dev/null; then
            healthy=true
            break
        fi
    elif curl --fail --silent --show-error "http://127.0.0.1/api/health" >/dev/null \
        && curl --fail --silent --show-error "http://127.0.0.1/" >/dev/null; then
        healthy=true
        break
    fi
    sleep 2
done

if [[ $healthy != "true" ]]; then
    docker compose -f "$release_path/compose.production.yaml" logs --tail=150 >&2 || true
    if [[ -n $previous_release && -d $previous_release ]]; then
        echo "blog deploy: health check failed; restoring previous release" >&2
        ln -sfn -- "$previous_release" "$current_link"
        deploy_stack "$previous_release" || true
    fi
    fail "deployment health check failed; inspect the runtime backup before retrying"
fi

rm -f -- "$archive_path"
install -o root -g root -m 0755 "$release_path/deploy/scripts/deploy-release.sh" \
    /usr/local/sbin/deploy-blog
install -o root -g root -m 0755 "$release_path/deploy/scripts/finish-bootstrap.sh" \
    /usr/local/sbin/finish-blog-bootstrap

mapfile -t removable_releases < <(
    find "$releases_directory" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
        | sort -nr \
        | tail -n "+$((BLOG_KEEP_RELEASES + 1))" \
        | cut -d' ' -f2-
)
for old_release in "${removable_releases[@]}"; do
    [[ $old_release == "$releases_directory/"* ]] || fail "refusing to remove an unexpected path"
    [[ $old_release != "$release_path" && $old_release != "$previous_release" ]] || continue
    rm -rf -- "$old_release"
done

echo "blog deploy complete: $commit_sha ($BLOG_PUBLIC_URL)"
