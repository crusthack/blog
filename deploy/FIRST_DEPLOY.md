# EC2 최초 배포

이 문서는 Ubuntu 24.04 LTS EC2에 처음 접속한 시점부터 Owner 초기화 완료까지의
절차다. 이후 배포는 [GitHub Actions CD 설정](GITHUB_ACTIONS_CD.md)을 사용한다.

## 1. AWS와 Cloudflare 준비

EC2를 만들기 전에 다음을 준비한다.

- Ubuntu Server 24.04 LTS, 64-bit 인스턴스
- 암호화된 EBS 볼륨과 삭제 방지 설정
- 재부팅 후에도 주소가 유지되는 Elastic IP
- Cloudflare에서 프록시된 `crusthack.com` A/AAAA 레코드
- `crusthack.com`을 SAN에 포함한 Cloudflare Origin CA 인증서와 개인 키

Security Group 인바운드는 다음만 허용한다.

| 포트 | 출발지 | 목적 |
|---|---|---|
| TCP 22 | 관리자 고정 IP `/32` | 최초 설정과 비상 운영 |
| TCP 80 | Cloudflare가 게시한 IPv4/IPv6 대역 | HTTPS redirect |
| TCP 443 | Cloudflare가 게시한 IPv4/IPv6 대역 | 실제 서비스 |

처음 연결을 확인하는 동안만 80/443을 넓게 열었다면 검증 후 Cloudflare 대역으로
반드시 축소한다. 3000과 8080은 Security Group에 추가하지 않는다.

Cloudflare Origin CA 인증서는 브라우저가 직접 신뢰하는 인증서가 아니다. DNS를
항상 Proxied 상태로 두고 Origin 인증서 설치 후 SSL/TLS 모드를 `Full (strict)`로
설정한다.

## 2. 관리자 SSH 접속과 기본 확인

로컬 PC에서 EC2 생성 시 지정한 키로 접속한다.

```bash
ssh -i ~/.ssh/ec2-admin.pem ubuntu@<EC2_ELASTIC_IP>
```

서버에서 OS, 시간, 디스크를 확인한다.

```bash
cat /etc/os-release
timedatectl
df -h
sudo apt-get update
sudo apt-get upgrade -y
sudo reboot
```

재부팅 후 다시 접속한다.

## 3. 소스와 최초 배포 자료 준비

최초 1회만 관리자 계정으로 저장소를 내려받는다. 공개 저장소가 아니라면 임시
deploy key 또는 짧은 수명의 GitHub 자격증명을 사용하고, 설치 완료 후 서버에서
GitHub 자격증명을 제거한다. 이후 CD는 Git clone을 사용하지 않는다.

```bash
sudo apt-get install -y git openssl
git clone https://github.com/crusthack/blog.git
cd blog
```

별도 배포 사용자나 배포 키는 만들지 않는다. 최초 접속에 사용한 EC2 개인 키
`ec2-admin.pem`을 뒤에서 GitHub Environment secret으로 등록해 Actions도
`ubuntu` 사용자로 접속하게 한다. 이 방식은 설정은 간단하지만 GitHub의 해당
Environment를 사용할 수 있는 주체가 서버의 관리자 권한까지 얻게 되므로,
Environment 승인 규칙과 저장소 관리자 권한을 엄격히 관리한다.

Cloudflare Dashboard의 `SSL/TLS → Origin Server`에서 발급한 값을 다음 파일에
저장한다. 개인 키는 다시 표시되지 않으므로 별도의 안전한 장소에도 백업한다.

```bash
cd ~/blog
install -d -m 700 secrets
editor secrets/cloudflare-origin.pem
editor secrets/cloudflare-origin.key
chmod 644 secrets/cloudflare-origin.pem
chmod 600 secrets/cloudflare-origin.key
```

Owner 최초 생성에 사용할 일회용 Setup Code를 만든다.

```bash
chmod +x deploy/scripts/create-setup-secret.sh
deploy/scripts/create-setup-secret.sh
```

출력된 Setup Code는 비밀번호 관리자에 잠시 보관한다. Owner 생성이 끝나면 서버의
원본과 함께 폐기한다.

## 4. EC2 호스트 초기화

다음 스크립트가 Docker 공식 apt 저장소를 등록하고 Docker Engine/Compose plugin,
영속 디렉터리와 root 소유 배포 명령을 설정한다. 표준 `ubuntu` 계정과 기존 EC2
SSH 키를 그대로 사용한다.

```bash
cd ~/blog
sudo bash deploy/scripts/bootstrap-ec2.sh
sudo systemctl status docker --no-pager
sudo docker run --rm hello-world
```

생성되는 주요 경로:

```text
/srv/blog/releases/          커밋별 애플리케이션 릴리스
/srv/blog/current            현재 릴리스 symlink
/srv/blog/shared/secrets/    Origin 인증서와 Setup Code
/srv/blog/shared/backups/    배포 전 runtime 백업
/etc/blog/deploy.env         배포 프로필
/usr/local/sbin/deploy-blog  root 소유 배포 진입점
```

`ubuntu` 사용자는 Docker 그룹에 추가하지 않는다. 배포 workflow는 Ubuntu AMI가
기본 제공하는 비대화형 sudo로 root 소유 배포 명령을 실행한다.

## 5. 첫 릴리스 배포

현재 커밋을 CD와 같은 형식으로 묶어 서버 배포 스크립트에 전달한다.

```bash
cd ~/blog
release_sha=$(git rev-parse HEAD)
git archive --format=tar.gz --output="/var/tmp/blog-$release_sha.tar.gz" "$release_sha"
sudo /usr/local/sbin/deploy-blog "$release_sha"
```

`/srv/blog/shared/bootstrap-enabled`가 있으므로 첫 배포에만
`compose.bootstrap.yaml`이 자동으로 포함된다.

```bash
cd /srv/blog/current
sudo docker compose -f compose.production.yaml -f compose.cloudflare.yaml \
  -f compose.bootstrap.yaml ps
curl --fail --insecure --resolve crusthack.com:443:127.0.0.1 \
  https://crusthack.com/api/health
```

Cloudflare DNS가 새 Elastic IP를 가리키는지 확인한 뒤 SSL/TLS 모드를
`Full (strict)`로 설정하고 다음을 확인한다.

```bash
curl --fail https://crusthack.com/api/health
curl --fail https://crusthack.com/
```

## 6. Owner 생성과 bootstrap 종료

1. `https://crusthack.com/setup`에서 Setup Code로 Owner를 생성한다.
2. 로그인하고 초안 글을 만든 뒤 익명 방문자에게 보이지 않는지 확인한다.
3. 글을 게시하고 익명 방문자도 읽을 수 있는지 확인한다.
4. 서버에서 bootstrap 종료 명령을 실행한다.

```bash
sudo /usr/local/sbin/finish-blog-bootstrap
sudo test ! -e /srv/blog/shared/secrets/owner-bootstrap-token
sudo test ! -e /srv/blog/shared/bootstrap-enabled
```

종료 스크립트는 API에서 Owner 생성 완료를 확인한 경우에만 Setup Code를 지우고
bootstrap override 없이 Backend를 재생성한다.

## 7. 첫 백업과 운영 확인

```bash
cd /srv/blog/current
sudo BACKUP_DIRECTORY=/srv/blog/shared/backups deploy/scripts/backup-runtime.sh
sudo ls -lh /srv/blog/shared/backups
sudo docker compose -f compose.production.yaml -f compose.cloudflare.yaml ps
sudo docker compose -f compose.production.yaml -f compose.cloudflare.yaml logs --tail=100
```

백업 파일은 EC2와 다른 저장소에도 복사한다. 같은 인스턴스에만 존재하는 백업은
인스턴스나 볼륨 장애를 복구하지 못한다.

## 8. 다음 단계

[GitHub Actions CD 설정](GITHUB_ACTIONS_CD.md)에 따라 `production` Environment와
SSH secrets를 등록한다. 설정 후 첫 CD는 `Actions → CD → Run workflow`에서
수동으로 실행해 검증하고, 이후에는 `main` CI 성공 시 자동 배포한다.
