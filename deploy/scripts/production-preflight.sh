#!/usr/bin/env sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$script_directory/../.." && pwd)
secret_file="$repository_root/secrets/owner-bootstrap-token"
compose_file="$repository_root/compose.production.yaml"

command -v docker >/dev/null 2>&1 || {
    echo "Docker is not installed or is not available on PATH." >&2
    exit 1
}

if grep -q "BLOG_BOOTSTRAP__TOKENFILE" "$compose_file"; then
    if [ ! -f "$secret_file" ]; then
        echo "Missing Setup Code. Run deploy/scripts/create-setup-secret.sh first." >&2
        exit 1
    fi

    secret_length=$(tr -d '\r\n' < "$secret_file" | wc -c | tr -d ' ')
    if [ "$secret_length" -lt 64 ]; then
        echo "The Setup Code must contain at least 64 hexadecimal characters." >&2
        exit 1
    fi
fi

if grep -q "DevelopmentOwner" "$compose_file"; then
    echo "DevelopmentOwner configuration must not appear in production Compose." >&2
    exit 1
fi

cd "$repository_root"
docker compose -f compose.production.yaml config --quiet
echo "Production preflight checks passed."
