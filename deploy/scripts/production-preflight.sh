#!/usr/bin/env sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$script_directory/../.." && pwd)
secret_file="$repository_root/secrets/owner-bootstrap-token"
certificate_file="$repository_root/secrets/cloudflare-origin.pem"
private_key_file="$repository_root/secrets/cloudflare-origin.key"
bootstrap=false
cloudflare=false

usage() {
    echo "Usage: $0 [--bootstrap] [--cloudflare]" >&2
    exit 2
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --bootstrap) bootstrap=true ;;
        --cloudflare) cloudflare=true ;;
        *) usage ;;
    esac
    shift
done

command -v docker >/dev/null 2>&1 || {
    echo "Docker is not installed or is not available on PATH." >&2
    exit 1
}

if [ "$bootstrap" = "true" ]; then
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

if [ "$cloudflare" = "true" ]; then
    command -v openssl >/dev/null 2>&1 || {
        echo "openssl is required to validate the Cloudflare Origin certificate." >&2
        exit 1
    }

    if [ ! -f "$certificate_file" ] || [ ! -f "$private_key_file" ]; then
        echo "Missing Cloudflare Origin certificate or private key under secrets/." >&2
        exit 1
    fi

    case "$(uname -s)" in
        Linux*)
            private_key_mode=$(stat -c '%a' "$private_key_file")
            case "$private_key_mode" in
                400 | 600) ;;
                *)
                    echo "The Cloudflare Origin private key must have mode 400 or 600." >&2
                    exit 1
                    ;;
            esac
            ;;
    esac

    openssl x509 -in "$certificate_file" -noout -checkend 86400 >/dev/null || {
        echo "The Cloudflare Origin certificate is invalid or expires within 24 hours." >&2
        exit 1
    }
    openssl x509 -in "$certificate_file" -noout -checkhost crusthack.com >/dev/null || {
        echo "The Cloudflare Origin certificate does not cover crusthack.com." >&2
        exit 1
    }
    openssl pkey -in "$private_key_file" -noout -check >/dev/null 2>&1 || {
        echo "The Cloudflare Origin private key is invalid." >&2
        exit 1
    }

    certificate_key=$(openssl x509 -in "$certificate_file" -pubkey -noout \
        | openssl pkey -pubin -outform der 2>/dev/null \
        | openssl dgst -sha256)
    private_key=$(openssl pkey -in "$private_key_file" -pubout -outform der 2>/dev/null \
        | openssl dgst -sha256)
    if [ "$certificate_key" != "$private_key" ]; then
        echo "The Cloudflare Origin certificate and private key do not match." >&2
        exit 1
    fi
fi

if grep -q "DevelopmentOwner" "$repository_root/compose.production.yaml" \
    "$repository_root/compose.bootstrap.yaml" \
    "$repository_root/compose.cloudflare.yaml"; then
    echo "DevelopmentOwner configuration must not appear in production Compose." >&2
    exit 1
fi

cd "$repository_root"
set -- -f compose.production.yaml
if [ "$cloudflare" = "true" ]; then
    set -- "$@" -f compose.cloudflare.yaml
fi
if [ "$bootstrap" = "true" ]; then
    set -- "$@" -f compose.bootstrap.yaml
fi
docker compose "$@" config --quiet
echo "Production preflight checks passed."
