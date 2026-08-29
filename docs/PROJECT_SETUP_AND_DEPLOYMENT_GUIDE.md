# Blog 프로젝트 생성·개발·배포 실습 교안

이 문서는 빈 폴더에서 Next.js와 ASP.NET Core 모노레포를 만들고, 로컬에서 개발하고, Docker로 운영 환경을 검증한 뒤, Ubuntu EC2에 처음 배포하는 전체 흐름을 설명한다.

명령어를 복사하기 전에 현재 터미널이 **PowerShell인지 Bash인지** 확인한다. 코드 블록 위에 적힌 셸에서만 실행하는 것이 가장 안전하다.

> 현재 저장소를 그대로 실행하거나 배포하려는 사람은 **2장부터** 시작하면 된다. 1장은 프로젝트를 처음부터 다시 만드는 원리를 익히기 위한 과정이다.

## 0. 최종 구조와 실행 방식

```text
사용자 브라우저
      |
      v
Nginx :80/:443
  |             |
  v             v
Next.js       ASP.NET Core
:3000         :8080
                  |
                  v
            SQLite + 업로드 + 암호화 키
            Docker volume /app/runtime
```

- 개발 환경: Windows에서 Frontend와 Backend를 각각 직접 실행한다.
- 운영 환경: Linux에서 Docker Compose로 세 컨테이너를 실행한다.
- 외부에는 Nginx만 공개한다. 3000번과 8080번 포트는 공개하지 않는다.
- 개발용 `localdev / password` 계정은 Development 환경에만 존재한다.
- 운영 Owner는 일회용 Setup Code와 `/setup` 화면으로 한 번만 만든다.

## 1. 빈 폴더에서 기본 프로젝트 만들기

이 장은 생성기만으로 얻을 수 있는 기본 골격을 만든다. Owner 인증, 게시글 API, Docker 설정은 생성기에서 자동으로 생기지 않는다. 해당 기능을 직접 학습해 구현하지 않는다면 이 저장소의 파일을 기준 구현으로 사용한다.

### 1.1 Windows 도구 설치

관리자 PowerShell에서 실행한다.

```powershell
winget install --exact --id Git.Git
winget install --exact --id OpenJS.NodeJS.LTS
winget install --exact --id Microsoft.DotNet.SDK.10
winget install --exact --id Docker.DockerDesktop
```

설치가 끝나면 Windows를 재시작하고 Docker Desktop을 한 번 실행한다. Docker가 가상화를 찾지 못하면 작업 관리자의 `성능 > CPU > 가상화`가 사용 상태인지 확인하고 BIOS/UEFI의 가상화 기능과 Windows의 WSL2 기능을 활성화한다.

새 PowerShell에서 버전을 확인한다.

```powershell
git --version
node --version
npm --version
dotnet --version
docker version
docker compose version
```

Docker 명령이 Server 정보를 반환하지 않으면 Docker Desktop이 아직 준비되지 않은 것이다.

### 1.2 모노레포 폴더 생성

PowerShell에서 실행한다.

```powershell
New-Item -ItemType Directory -Force -Path C:\Users\Jin\Documents\blog\blog
Set-Location C:\Users\Jin\Documents\blog\blog
git init -b main
New-Item -ItemType Directory -Force -Path apps, deploy, tests, docs, secrets
New-Item -ItemType File -Force -Path secrets\.gitkeep
```

### 1.3 Next.js Frontend 생성

```powershell
npx create-next-app@latest apps/frontend --ts --eslint --tailwind --app --src-dir --use-npm --import-alias "@/*"
```

질문이 추가로 나오면 Turbopack은 기본값을 사용해도 된다. 생성 후 단독 실행을 확인한다.

```powershell
Set-Location apps\frontend
npm run dev
```

브라우저에서 `http://localhost:3000`을 열어 확인한 뒤 `Ctrl+C`로 종료하고 루트로 돌아간다.

```powershell
Set-Location ..\..
```

### 1.4 ASP.NET Core Backend 생성

```powershell
dotnet new webapi -n Blog.Api -o apps/backend --use-controllers
dotnet new sln --format slnx -n Blog
dotnet sln Blog.slnx add apps/backend/Blog.Api.csproj
dotnet run --project apps/backend/Blog.Api.csproj
```

표시된 localhost 주소의 OpenAPI 문서를 확인한 뒤 `Ctrl+C`로 종료한다.

테스트 프로젝트도 만든다.

```powershell
dotnet new xunit -n Blog.Api.Tests -o tests/Blog.Api.Tests
dotnet add tests/Blog.Api.Tests/Blog.Api.Tests.csproj reference apps/backend/Blog.Api.csproj
dotnet sln Blog.slnx add tests/Blog.Api.Tests/Blog.Api.Tests.csproj
```

### 1.5 루트 npm workspace 구성

루트 `package.json`에는 Frontend workspace와 공통 명령을 둔다. 현재 저장소의 `package.json`을 기준으로 다음 명령들이 있어야 한다.

```text
dev:backend       Backend 개발 서버
dev:frontend      Frontend 개발 서버
lint:frontend     ESLint
build:frontend    Next.js 운영 빌드
test:backend      Backend 테스트
deploy:build      Docker 이미지 빌드
deploy:up         운영 Compose 시작
deploy:down       운영 Compose 종료
```

생성기 이후의 실제 기능 구현은 다음 파일군을 기준으로 나누어 학습한다.

- `apps/backend/Data`: EF Core와 SQLite
- `apps/backend/Models`: 사용자, 설치 상태, 게시글 모델
- `apps/backend/Setup`: 일회용 Setup Code와 개발 Owner 격리
- `apps/backend/Controllers`: Setup, 로그인, 게시글 API
- `apps/frontend/src/lib/contracts.ts`: Frontend가 사용하는 API DTO
- `apps/frontend/src/components`: 로그인, Setup, Markdown 작성 UI
- `compose.production.yaml`: 운영 컨테이너와 영속 볼륨
- `deploy/nginx/nginx.conf`: `/api`와 Frontend reverse proxy
- `.github/workflows/ci.yml`: GitHub Actions 검증

## 2. 현재 저장소를 처음 받기

새 컴퓨터에서는 다음 방식이 가장 빠르다.

```powershell
Set-Location C:\Users\Jin\Documents\blog
git clone https://github.com/crusthack/blog.git blog
Set-Location .\blog
npm ci
dotnet restore Blog.slnx
```

비공개 저장소라면 GitHub 인증이 필요하지만 Docker Hub 회원가입이나 `docker login`은 필요하지 않다. 현재 사용하는 공개 베이스 이미지는 로그인 없이 받을 수 있다.

현재 작업 폴더처럼 이미 저장소가 있다면 다음만 실행한다.

```powershell
Set-Location C:\Users\Jin\Documents\blog\blog
npm ci
dotnet restore Blog.slnx
git status --short --branch
```

## 3. 로컬 개발 환경 실행

Docker와 Nginx는 사용하지 않는다. PowerShell 창 두 개를 연다.

### 3.1 Backend 터미널

```powershell
Set-Location C:\Users\Jin\Documents\blog\blog
npm run dev:backend
```

### 3.2 Frontend 터미널

```powershell
Set-Location C:\Users\Jin\Documents\blog\blog
npm run dev:frontend
```

브라우저에서 `http://localhost:3000/login`을 연다.

```text
아이디: localdev
비밀번호: password
```

로그인 후 `새 글`에서 Markdown 글을 작성한다. 공개 게시를 선택하지 않으면 초안이 된다.

개발 데이터는 `apps/backend/runtime/`에 생기며 Git에 포함되지 않는다.

### 3.3 종료

각 터미널에서 `Ctrl+C`를 누른다.

## 4. 코드 검증

커밋 전 PowerShell에서 다음을 순서대로 실행한다.

```powershell
Set-Location C:\Users\Jin\Documents\blog\blog
npm run lint:frontend
$env:API_SERVER_URL = 'http://localhost:5268'
npm run build:frontend
Remove-Item Env:API_SERVER_URL
dotnet format Blog.slnx --verify-no-changes --no-restore
dotnet test Blog.slnx --configuration Release --no-restore
docker compose -f compose.production.yaml config --quiet
```

모두 종료 코드 0으로 끝나야 한다. 테스트가 실패하면 배포로 넘어가지 않는다.

## 5. Windows에서 Docker Production 검증

이 검증은 실제 EC2와 같은 Production 설정을 로컬에서 실행한다. 개발 계정이 운영 환경에 새어 들어가지 않았는지도 함께 확인할 수 있다.

### 5.1 Setup Code 생성

Git Bash를 열고 실행한다.

```bash
cd /c/Users/Jin/Documents/blog/blog
chmod +x deploy/scripts/*.sh
deploy/scripts/create-setup-secret.sh
deploy/scripts/production-preflight.sh
```

생성된 `secrets/owner-bootstrap-token`은 절대로 커밋하거나 채팅에 붙여 넣지 않는다.

이미 파일이 있어 생성기가 덮어쓰기를 거부하면 기존 로컬 Production 환경을 계속 쓸지 먼저 결정한다. 새 테스트 환경이 꼭 필요할 때만 기존 컨테이너와 볼륨의 보존 여부를 확인한 후 별도로 정리한다.

### 5.2 이미지 빌드와 실행

PowerShell에서 실행한다.

```powershell
Set-Location C:\Users\Jin\Documents\blog\blog
docker compose -f compose.production.yaml up -d --build
docker compose -f compose.production.yaml ps
```

`backend`, `frontend`, `nginx`가 모두 `healthy`가 될 때까지 잠시 기다린다.

```powershell
Invoke-WebRequest http://localhost/api/health -UseBasicParsing
Start-Process http://localhost/setup
```

Setup Code 파일의 내용을 직접 입력해 테스트 Owner를 만든다. 이 계정과 데이터는 로컬 Docker volume에만 저장되는 테스트 자료다.

### 5.3 수동 점검표

- Owner를 한 번 생성한 뒤 `/setup` 재시도가 거부되는가?
- Owner 로그인이 되는가?
- `localdev / password` 로그인이 거부되는가?
- 초안은 로그아웃한 사용자에게 보이지 않는가?
- 공개 글은 로그아웃한 사용자에게 보이는가?
- `docker compose restart` 뒤에도 Owner와 글이 남아 있는가?
- `docker compose ps`에서 세 서비스가 모두 `healthy`인가?

로그를 확인한다.

```powershell
docker compose -f compose.production.yaml logs --tail 200
```

### 5.4 백업 만들기

Git Bash에서 실행한다. 잠깐 Backend를 멈춰 일관된 SQLite 백업을 만들고 자동으로 다시 시작한다.

```bash
cd /c/Users/Jin/Documents/blog/blog
deploy/scripts/backup-runtime.sh
```

결과는 `backups/blog-runtime-날짜.tar.gz`와 SHA256 파일이다. 두 파일 모두 Git에서 제외된다.

### 5.5 종료와 데이터 삭제의 차이

컨테이너만 종료하고 데이터는 보존한다.

```powershell
docker compose -f compose.production.yaml down
```

다음 명령은 Docker volume과 블로그 데이터를 삭제하므로 평상시에는 실행하지 않는다.

```powershell
# 위험: 로컬 Production DB와 암호화 키까지 삭제한다.
docker compose -f compose.production.yaml down --volumes
```

## 6. Git과 GitHub CI

먼저 커밋될 파일만 확인한다.

```powershell
git status --short
git diff --check
git diff
```

Setup Code, DB, 백업 파일이 보이면 커밋하지 말고 `.gitignore`부터 확인한다.

```powershell
git add --all
git diff --cached --check
git diff --cached --stat
git commit -m "feat: describe the change"
```

아래 명령은 원격 저장소를 실제로 변경한다. 검토를 끝내고 push하기로 결정한 경우에만 실행한다.

```powershell
git push origin main
```

GitHub 저장소의 `Actions` 탭에서 Backend와 Frontend 작업이 모두 성공했는지 확인한다. 실패한 상태에서는 EC2에 배포하지 않는다.

> 이 교안을 작성한 시점에는 Docker 강화 커밋 `02fed2f`가 로컬에만 있고 `origin/main`보다 한 커밋 앞서 있다. EC2가 최신 구성을 clone하려면 사용자가 검토한 뒤 이 커밋을 먼저 push해야 한다.

## 7. EC2 생성

AWS Console에서 `EC2 > 인스턴스 시작`을 연다. 개인 저트래픽 블로그의 시작값은 다음처럼 단순하게 잡을 수 있다.

- 이름: `blog-production`
- AMI: Ubuntu Server 24.04 LTS
- 아키텍처: x86_64
- 인스턴스: `t3.small`부터 시작
- 키 페어: 새 `.pem` 키를 만들고 안전하게 보관
- 루트 EBS: `gp3`, 30 GiB 정도부터 시작, 암호화 활성화
- 자동 퍼블릭 IP 또는 Elastic IP 사용

`t3.small`과 30 GiB는 절대값이 아니라 현재 Docker 이미지 빌드와 개인 사이트 운용을 위한 무난한 시작점이다. 메모리 부족이 보이면 인스턴스를 키우고, 디스크 사용량이 늘면 EBS를 확장한다.

보안 그룹 인바운드는 다음만 둔다.

| 포트 | 소스 | 시점 |
| --- | --- | --- |
| 22/TCP | `내 IP`만 | 처음부터 |
| 80/TCP | `0.0.0.0/0`, `::/0` | HTTP 검증 또는 인증서 발급 시 |
| 443/TCP | `0.0.0.0/0`, `::/0` | HTTPS 설정 후 |

3000과 8080은 추가하지 않는다. AWS의 Security Group은 인스턴스 방화벽 역할을 하고, EBS 암호화는 볼륨·스냅샷의 저장 데이터를 보호한다.

인스턴스를 만든 후 Elastic IP를 할당해 인스턴스에 연결한다. 도메인의 DNS `A` 레코드는 이 IP를 가리키게 한다. DNS 전파에는 시간이 걸릴 수 있다.

## 8. Windows에서 EC2 접속

다운로드한 키를 예를 들어 `C:\Users\Jin\.ssh\blog-production.pem`에 둔다.

PowerShell에서 키 권한을 제한한다.

```powershell
$keyPath = 'C:\Users\Jin\.ssh\blog-production.pem'
icacls $keyPath /inheritance:r
icacls $keyPath /grant:r "$($env:USERNAME):(R)"
```

접속한다. IP는 실제 Elastic IP로 바꾼다.

```powershell
ssh -i C:\Users\Jin\.ssh\blog-production.pem ubuntu@203.0.113.10
```

이후 9장부터는 EC2의 Ubuntu Bash에서 실행한다.

## 9. EC2에 Docker와 Git 설치

Ubuntu를 갱신한다.

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Docker 공식 apt 저장소를 추가한다.

```bash
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

Docker Engine과 Compose plugin을 설치한다.

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
exit
```

SSH로 다시 접속해야 그룹 권한이 적용된다.

```powershell
ssh -i C:\Users\Jin\.ssh\blog-production.pem ubuntu@203.0.113.10
```

EC2에서 확인한다.

```bash
docker version
docker compose version
docker run --rm hello-world
```

## 10. EC2 첫 배포

### 10.1 저장소 받기

```bash
cd ~
git clone https://github.com/crusthack/blog.git
cd blog
git status --short --branch
git log -1 --oneline
```

표시된 커밋이 GitHub Actions를 통과한 배포 대상인지 확인한다. 비공개 저장소라면 GitHub deploy key 또는 최소 권한 토큰을 사용한다. 개인 비밀번호를 서버에 저장하지 않는다.

### 10.2 EC2 전용 Setup Code 생성

로컬 테스트용 코드를 복사하지 말고 EC2에서 새로 만든다.

```bash
chmod +x deploy/scripts/*.sh
deploy/scripts/create-setup-secret.sh
deploy/scripts/production-preflight.sh
```

Setup Code 확인이 필요할 때만 다음을 실행하고, 화면 공유나 셸 기록에 노출하지 않는다.

```bash
sudo cat secrets/owner-bootstrap-token
```

### 10.3 실행

```bash
docker compose -f compose.production.yaml up -d --build
docker compose -f compose.production.yaml ps
curl --fail http://127.0.0.1/api/health
```

세 서비스가 모두 `healthy`가 아니면 로그부터 확인한다.

```bash
docker compose -f compose.production.yaml logs --tail 200
docker system df
df -h
free -h
```

## 11. 공개 HTTP 없이 최초 Owner 만들기

HTTPS가 아직 없다면 Setup Code와 비밀번호를 공용 HTTP로 보내지 않는다. 보안 그룹은 22번만 허용한 채 SSH 터널을 사용한다.

Windows에서 기존 SSH 창과 별도로 다음을 실행한다.

```powershell
ssh -i C:\Users\Jin\.ssh\blog-production.pem -L 8088:127.0.0.1:80 ubuntu@203.0.113.10
```

이 SSH 연결을 유지하고 브라우저에서 `http://localhost:8088/setup`을 연다. EC2에서 생성한 Setup Code로 실제 Owner를 만든다. 이어서 다음을 확인한다.

1. 실제 Owner 로그인
2. Markdown 초안 작성
3. 로그아웃 상태에서 초안 접근 불가
4. 글 공개 후 로그아웃 상태에서 조회 가능
5. `localdev / password` 로그인 거부

## 12. Owner 생성 후 Setup Code 제거

먼저 백업한다.

```bash
cd ~/blog
deploy/scripts/backup-runtime.sh
ls -lh backups
```

`compose.production.yaml`의 Backend에서 다음 항목을 제거한다.

```yaml
BLOG_BOOTSTRAP__TOKENFILE: /run/secrets/owner_bootstrap_token
```

```yaml
secrets:
  - owner_bootstrap_token
```

파일 맨 아래의 다음 항목도 제거한다.

```yaml
secrets:
  owner_bootstrap_token:
    file: ./secrets/owner-bootstrap-token
```

구성을 검증하고 Backend를 재생성한다.

```bash
docker compose -f compose.production.yaml config --quiet
docker compose -f compose.production.yaml up -d --force-recreate backend
docker compose -f compose.production.yaml ps
curl --fail http://127.0.0.1/api/health
```

Owner 로그인이 유지되고 `/setup` 재시도가 거부되는지 확인한 뒤 Setup Code를 삭제한다.

```bash
shred -u secrets/owner-bootstrap-token
```

가상화된 스토리지에서는 `shred`가 물리 블록 삭제를 보장하지 않지만 파일 재사용과 우발적 노출을 방지하는 운영 절차로 사용한다. EBS 자체는 암호화된 상태여야 한다.

> 서버에서 직접 수정한 Compose 파일은 다음 `git pull` 때 충돌할 수 있다. 장기적으로는 초기 Setup 전용 Compose override 파일을 별도로 두는 방식으로 개선한다.

## 13. HTTPS 공개 전환

현재 저장소의 Nginx 설정은 HTTP까지만 제공한다. 실제 사이트를 공개하기 전에 아래 두 방식 중 하나를 선택해 별도의 변경으로 검증한다.

### 방식 A: Cloudflare에서 TLS 종료

- DNS를 Cloudflare proxy 상태로 연결한다.
- SSL/TLS 모드는 `Full (strict)`를 사용한다.
- EC2 Nginx에도 Cloudflare Origin Certificate 또는 공인 인증서를 설치한다.
- Cloudflare IP만 origin의 80/443에 접근하도록 제한하면 더 안전하다.

### 방식 B: EC2 Nginx에 Let's Encrypt 인증서 설치

- 도메인 DNS가 Elastic IP를 가리키는지 확인한다.
- Nginx 컨테이너에 `/etc/letsencrypt`를 읽기 전용 mount한다.
- 443 listener, 인증서 경로, HTTP→HTTPS redirect를 `nginx.conf`에 추가한다.
- Certbot 갱신 뒤 Nginx reload 절차를 예약한다.

현재 Nginx는 컨테이너 안에 있으므로 호스트의 `certbot --nginx` 명령만 실행해서는 설정이 자동 완성되지 않는다. 인증서 volume과 Nginx 설정 변경을 함께 커밋·검증해야 한다.

HTTPS 확인이 끝난 뒤 보안 그룹의 80/443을 공개하고 다음을 점검한다.

```bash
curl --head https://YOUR_DOMAIN/
curl --fail https://YOUR_DOMAIN/api/health
```

- HTTP 요청이 HTTPS로 이동하는가?
- 로그인 쿠키에 `Secure`, `HttpOnly`, `SameSite=Strict`가 있는가?
- 3000과 8080이 외부에서 닫혀 있는가?
- `/setup`으로 두 번째 Owner를 만들 수 없는가?

## 14. 이후 배포

코드 변경마다 로컬 검증과 GitHub CI를 먼저 통과시킨다. EC2에서 실행한다.

```bash
cd ~/blog
deploy/scripts/backup-runtime.sh
git fetch origin
git status --short --branch
git pull --ff-only origin main
deploy/scripts/production-preflight.sh
docker compose -f compose.production.yaml up -d --build
docker compose -f compose.production.yaml ps
curl --fail http://127.0.0.1/api/health
docker compose -f compose.production.yaml logs --tail 100
```

서버에서 추적 파일을 직접 수정했다면 `git pull --ff-only`가 실패할 수 있다. 변경을 덮어쓰지 말고 먼저 `git status`로 원인을 확인한다.

## 15. 정기 백업과 복구 연습

백업은 EC2 디스크 안에만 두면 인스턴스나 볼륨 장애를 함께 겪는다. 생성 후 S3 등 EC2 밖의 저장소로 복사한다. SQLite DB뿐 아니라 업로드와 ASP.NET Data Protection 키를 함께 보존해야 기존 로그인 세션과 암호화 자료를 정상적으로 다룰 수 있다.

수동 백업:

```bash
cd ~/blog
BACKUP_DIRECTORY="$HOME/blog-backups" deploy/scripts/backup-runtime.sh
sha256sum -c "$HOME"/blog-backups/*.sha256
```

자동화를 만들기 전에는 다음을 먼저 정한다.

- 실행 주기와 보관 기간
- S3 암호화와 접근 권한
- 백업 실패 알림
- 새 인스턴스에서 실제 복구하는 연습 일정

## 16. 자주 쓰는 운영 명령

EC2의 `~/blog`에서 실행한다.

```bash
# 상태
docker compose -f compose.production.yaml ps

# 최근 로그
docker compose -f compose.production.yaml logs --tail 200

# 특정 서비스 로그
docker compose -f compose.production.yaml logs --tail 200 backend

# 안전한 재시작
docker compose -f compose.production.yaml restart

# 이미지 재빌드와 반영
docker compose -f compose.production.yaml up -d --build

# 컨테이너 종료, 데이터 volume 보존
docker compose -f compose.production.yaml down

# 디스크와 Docker 사용량
df -h
docker system df

# Backend health
curl --fail http://127.0.0.1/api/health
```

`docker system prune`, `docker volume rm`, `docker compose down --volumes`는 데이터를 지우거나 복구에 필요한 자원을 제거할 수 있다. 정확한 대상과 백업을 확인하기 전에는 실행하지 않는다.

## 17. 장애가 났을 때 확인 순서

### 컨테이너가 unhealthy

```bash
docker compose -f compose.production.yaml ps
docker compose -f compose.production.yaml logs --tail 200 backend frontend nginx
```

### 사이트 접속 불가

```bash
curl --verbose http://127.0.0.1/
curl --verbose http://127.0.0.1/api/health
sudo ss -lntp
```

로컬 curl은 되는데 외부 접속만 실패하면 Security Group, Elastic IP, DNS, Cloudflare 설정을 확인한다.

### 디스크 부족

```bash
df -h
docker system df
sudo du -xhd1 /var/lib/docker | sort -h
```

백업과 Docker 자원의 용도를 확인한 뒤 정리한다. 무작정 volume을 삭제하지 않는다. EBS 크기를 늘렸다면 AWS Console 작업만으로 끝내지 말고 파티션과 파일시스템 확장 여부도 확인한다.

### 메모리 부족

```bash
free -h
docker stats --no-stream
journalctl -k --grep='Out of memory' --grep='Killed process'
```

이미지 빌드 중 메모리가 부족하면 더 큰 인스턴스에서 빌드하거나, CI에서 이미지를 만들어 registry에서 내려받는 구조로 개선한다.

## 18. 첫 배포 완료 기준

- [ ] 로컬 lint, build, format, test 성공
- [ ] GitHub Actions 성공
- [ ] EC2 EBS 암호화 활성화
- [ ] SSH는 내 IP만 허용
- [ ] 3000과 8080은 외부에 미공개
- [ ] 세 컨테이너가 healthy
- [ ] `/api/health` 200
- [ ] SSH 터널 또는 HTTPS로 Owner 생성
- [ ] Setup Code 연결과 파일 제거
- [ ] 개발 계정의 운영 로그인 거부
- [ ] 초안과 공개 글 권한 확인
- [ ] HTTPS와 쿠키 보안 확인
- [ ] 첫 백업 생성 및 EC2 외부 복사
- [ ] 재시작 후 Owner와 글 보존 확인

## 공식 참고 자료

- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Docker Compose plugin](https://docs.docker.com/compose/install/linux/)
- [AWS EC2 인스턴스 시작 개념](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/tutorial-launch-a-test-ec2-instance.html)
- [EC2 시작 설정 항목](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-launch-parameters.html)
- [Amazon EBS 암호화](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-encryption.html)
- [Certbot 공식 안내](https://certbot.eff.org/instructions)
