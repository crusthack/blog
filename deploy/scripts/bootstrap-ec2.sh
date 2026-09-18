#!/usr/bin/env bash
set -euo pipefail

fail() {
    echo "EC2 bootstrap: $*" >&2
    exit 1
}

[[ $EUID -eq 0 ]] || fail "run with sudo"
readonly script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
readonly repository_root=$(CDPATH= cd -- "$script_directory/../.." && pwd)
readonly deployment_user="ubuntu"
readonly app_root="/srv/blog"
readonly shared_directory="$app_root/shared"

for required_file in cloudflare-origin.pem cloudflare-origin.key owner-bootstrap-token; do
    [[ -f $repository_root/secrets/$required_file ]] \
        || fail "missing secrets/$required_file; prepare it before running this script"
done
id "$deployment_user" >/dev/null 2>&1 \
    || fail "the standard Ubuntu EC2 user does not exist: $deployment_user"
runuser -u "$deployment_user" -- sudo -n true \
    || fail "$deployment_user must have non-interactive sudo access"

apt-get update
apt-get install -y ca-certificates curl git openssl util-linux
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker compose version

install -d -m 0755 "$app_root/releases"
install -d -m 0700 "$shared_directory/secrets" "$shared_directory/backups"
install -m 0600 "$repository_root/secrets/cloudflare-origin.key" "$shared_directory/secrets/cloudflare-origin.key"
install -m 0644 "$repository_root/secrets/cloudflare-origin.pem" "$shared_directory/secrets/cloudflare-origin.pem"
install -m 0600 "$repository_root/secrets/owner-bootstrap-token" "$shared_directory/secrets/owner-bootstrap-token"
touch "$shared_directory/bootstrap-enabled"
chmod 0600 "$shared_directory/bootstrap-enabled"

install -d -m 0755 /etc/blog
cat > /etc/blog/deploy.env <<'EOF'
BLOG_PUBLIC_URL=https://crusthack.com
BLOG_CLOUDFLARE=true
BLOG_KEEP_RELEASES=5
EOF
chmod 0600 /etc/blog/deploy.env

install -o root -g root -m 0755 "$repository_root/deploy/scripts/deploy-release.sh" /usr/local/sbin/deploy-blog
install -o root -g root -m 0755 "$repository_root/deploy/scripts/finish-bootstrap.sh" /usr/local/sbin/finish-blog-bootstrap

echo "EC2 host bootstrap complete; GitHub Actions can deploy as: $deployment_user"
