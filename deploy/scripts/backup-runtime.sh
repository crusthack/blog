#!/usr/bin/env sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$script_directory/../.." && pwd)
compose_file="$repository_root/compose.production.yaml"
backup_directory=${BACKUP_DIRECTORY:-"$repository_root/backups"}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive_name="blog-runtime-$timestamp.tar.gz"

command -v docker >/dev/null 2>&1 || {
    echo "Docker is not installed or is not available on PATH." >&2
    exit 1
}

cd "$repository_root"
backend_container=$(docker compose -f "$compose_file" ps --quiet backend)
if [ -z "$backend_container" ]; then
    echo "The Backend container does not exist." >&2
    exit 1
fi

mkdir -p "$backup_directory"
umask 077

docker_backup_directory=$backup_directory
disable_path_conversion=0
case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*)
        docker_backup_directory=$(cygpath -w "$backup_directory")
        disable_path_conversion=1
        ;;
esac

restart_backend=false
if [ "$(docker inspect --format '{{.State.Running}}' "$backend_container")" = "true" ]; then
    restart_backend=true
    docker compose -f "$compose_file" stop backend
fi

cleanup() {
    if [ "$restart_backend" = "true" ]; then
        docker compose -f "$compose_file" start backend >/dev/null
    fi
}
trap cleanup EXIT INT TERM

MSYS_NO_PATHCONV=$disable_path_conversion docker run --rm \
    --volumes-from "$backend_container":ro \
    --volume "$docker_backup_directory:/backup" \
    alpine:3.22 \
    tar -czf "/backup/$archive_name" -C /app/runtime .

if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$backup_directory/$archive_name" > "$backup_directory/$archive_name.sha256"
fi

cleanup
trap - EXIT INT TERM

echo "Runtime backup created at: $backup_directory/$archive_name"
