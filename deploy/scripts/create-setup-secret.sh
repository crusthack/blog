#!/usr/bin/env sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$script_directory/../.." && pwd)
secret_directory="$repository_root/secrets"
secret_file="$secret_directory/owner-bootstrap-token"

if [ -e "$secret_file" ]; then
    echo "Refusing to overwrite the existing Setup Code: $secret_file" >&2
    exit 1
fi

command -v openssl >/dev/null 2>&1 || {
    echo "openssl is required to generate the Setup Code." >&2
    exit 1
}

umask 077
mkdir -p "$secret_directory"
openssl rand -hex 32 > "$secret_file"

echo "Setup Code created at: $secret_file"
echo "Keep this file private and remove its Compose connection after Owner setup."
