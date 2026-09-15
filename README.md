# Blog

Next.js Frontend와 ASP.NET Core Backend를 한 저장소에서 관리하는 모노레포입니다.

현재 기본 기능은 다음과 같습니다.

- 일회용 Setup Code를 이용한 최초 Owner 계정 생성
- HttpOnly 세션 쿠키 기반 Owner 로그인·로그아웃
- Markdown 포스트 작성과 실시간 미리보기
- 즉시 게시, 편집과 삭제
- 글별 공개·비공개·코드로 열람 설정과 첨부 파일 접근 제어
- 공개 포스트 목록 및 본문 조회
- 카테고리 생성·조회·수정·숨김·정렬·삭제와 글 분류
- 카테고리별 탐색과 제목·설명 검색
- 반응형 문서형 블로그 레이아웃과 소개 페이지
- Markdown 서식 삽입 도구와 읽기 시간 표시
- 글별 JPG·PNG·PDF 업로드, 이름 변경, 삭제와 Markdown 삽입
- Owner용 외부 사이트 메뉴 설정
- API·SQLite 상태 확인 화면

기존 프로젝트의 이미지·첨부 파일 관리 기능은 현재 인증·저장 구조에 맞게 이식했습니다.
import/export와 슬라이드 기능은 아직 이식하지 않았습니다.
기능 이식 순서와 호환 원칙은 [기능 이식 로드맵](docs/FEATURE_MIGRATION_ROADMAP.md)에 정리되어 있습니다.

## 구조

```text
apps/
  frontend/  Next.js
  backend/   ASP.NET Core Web API
deploy/
  nginx/     로컬 HTTP와 Cloudflare Origin HTTPS reverse proxy 설정
  scripts/   Setup Secret 생성, 운영 사전 점검과 runtime 백업
tests/       Backend 통합 테스트
```

루트의 Compose 파일은 역할별로 분리됩니다.

- `compose.production.yaml`: 항상 사용하는 기본 운영 구성
- `compose.bootstrap.yaml`: 최초 Owner 생성 전까지만 추가
- `compose.cloudflare.yaml`: `crusthack.com` Cloudflare Origin HTTPS에서 추가

## 실행 환경 구분

| 항목 | 로컬 개발 환경 | 운영 배포 환경 |
| --- | --- | --- |
| 실행 위치 | Windows 호스트 | Linux Docker Compose |
| Frontend | `next dev`, 포트 3000 | Next.js standalone 컨테이너, 내부 포트 3000 |
| Backend | `dotnet run`, 포트 5268 | ASP.NET Core 컨테이너, 내부 포트 8080 |
| 외부 진입점 | Frontend에 직접 접속 | Nginx 포트 80만 공개 |
| API 전달 | Next.js rewrite → `localhost:5268` | Nginx `/api/*` → Backend |
| 데이터베이스 | `apps/backend/runtime/blog.db` | Docker volume의 `/app/runtime/blog.db` |
| Owner 초기화 | 고정 개발 계정 자동 동기화 | Setup Code를 Docker Secret으로 주입 |
| ASP.NET 환경 | `Development` | `Production` |

로컬 개발에서는 Docker와 Nginx를 실행하지 않습니다. 운영에서는 Node.js와 .NET SDK를 호스트에 설치하지 않고 Docker 이미지만 실행합니다.

## 로컬 개발 환경

요구 사항은 Node.js 24 이상, npm 11 이상, .NET SDK 10입니다.

### 1. 로컬 개발 Owner

Development 환경은 [appsettings.Development.json](apps/backend/appsettings.Development.json)의 고정 계정을 시작할 때 자동 생성하거나 기존 Owner와 동기화합니다.

```text
Username: localdev
Email: localdev@localhost.invalid
Password: password
```

이 계정은 `ASPNETCORE_ENVIRONMENT=Development`일 때만 DI에 등록되고 적용됩니다. 개발 설정이 다른 환경에 들어오면 Backend는 시작을 거부하며, 설정 파일 자체도 Docker 빌드 컨텍스트와 publish 결과에서 제외됩니다. 운영 환경에서는 Setup Code를 이용한 최초 가입 흐름만 사용합니다.

### 2. 애플리케이션 실행

Backend 터미널:

```powershell
npm run dev:backend
```

Frontend 터미널:

```powershell
npm run dev:frontend
```

브라우저에서 `http://localhost:3000/login`을 열고 로컬 개발 Owner로 로그인합니다. 상단의 `새 글` 메뉴에서 Markdown 포스트를 작성하고 `게시하기`를 누르면 바로 공개됩니다. 수정 내용도 저장 즉시 반영됩니다.
`카테고리` 메뉴에서는 분류와 노출 순서를 관리할 수 있고 글 편집기에서 카테고리를 선택할 수 있습니다. 글을 한 번 저장한 뒤에는 JPG·PNG·PDF를 첨부하고 Markdown 문법을 현재 커서 위치에 삽입할 수 있습니다. Owner 메뉴의 `사이트 설정`에서는 상단 외부 사이트 목록을 관리합니다. 공개 화면은 카테고리별 URL과 제목·설명 검색을 제공하며 footer의 `서비스 상태`에서 API와 SQLite 연결 상태를 확인할 수 있습니다.

## 운영 배포 환경

### 글 공개 범위

편집기의 `공개 범위`에서 다음 중 하나를 선택합니다. 초안이나 별도 발행 단계 없이 저장 즉시 적용됩니다.

| 범위 | 방문자 목록·검색 | 본문·첨부 파일 |
| --- | --- | --- |
| 공개 | 제목·설명 표시 | 누구나 열람 |
| 비공개 | 숨김 | 로그인한 Owner만 열람 |
| 코드로 열람 | 제목·설명 표시 | 글별 접근 코드 입력 후 열람 |

접근 코드는 4~128자이며 서버에는 단방향 해시만 저장합니다. 수정 화면에서 코드를 비워 두면 기존 코드를 유지하고, 새 코드를 저장하면 기존 열람 권한이 무효화됩니다. 공개 범위를 변경해도 기존 권한을 무효화합니다. 숨긴 카테고리의 글은 코드 입력 여부와 관계없이 Owner만 열람합니다.

`POST /api/posts/{postNumber}/unlock`에 `{ "code": "지정한 코드" }`를 보내면 해당 글에만 유효한 12시간짜리 HttpOnly 쿠키를 발급합니다. 잘못된 코드는 400, 잠긴 본문 조회는 403, 비공개 글·열 수 없는 첨부 파일은 404입니다. 코드 입력은 IP별 15분에 10회로 제한합니다. 본문·목록·첨부 응답은 캐시 저장을 금지합니다.

DB migration은 기존 글에 `Public` 공개 범위를 부여합니다. 배포 시 Backend 시작 과정에서 자동 적용됩니다.

### 서버 실행

운영 서버에는 Docker Engine과 Docker Compose plugin만 설치합니다. 저장소를 받은 후 운영용 Setup Code를 생성합니다.

```bash
chmod +x deploy/scripts/*.sh
deploy/scripts/create-setup-secret.sh
deploy/scripts/production-preflight.sh --bootstrap
```

Setup Code는 `compose.bootstrap.yaml`을 함께 사용할 때만 Docker Secret으로 Backend 컨테이너의 `/run/secrets/owner_bootstrap_token`에 읽기 전용 주입됩니다. 원본 파일은 Git과 Docker 이미지 빌드 컨텍스트에서 제외됩니다.

최초 Owner 생성 전에는 Bootstrap override를 함께 사용합니다.

```bash
docker compose -f compose.production.yaml -f compose.bootstrap.yaml up -d --build
```

로컬 검증에서는 `http://localhost/setup`에서 Owner를 생성합니다. 외부에는 Nginx만 공개되고 Frontend와 Backend 포트는 Docker 네트워크 내부에만 노출됩니다.

운영 설정은 Compose 환경 변수와 Secret으로만 전달됩니다. `DevelopmentOwner` 설정을 운영 환경 변수나 운영 설정 파일에 추가하면 안전을 위해 Backend 기동이 실패합니다.

```text
ASPNETCORE_ENVIRONMENT=Production
DOTNET_ENVIRONMENT=Production
BLOG_ConnectionStrings__BlogDatabase=Data Source=/app/runtime/blog.db
BLOG_BOOTSTRAP__TOKENFILE=/run/secrets/owner_bootstrap_token
```

초기화가 끝나면 기본 Compose만으로 컨테이너를 재생성하고 Setup Code 파일을 삭제합니다. 추적 파일을 서버에서 직접 수정할 필요가 없으며 데이터베이스의 초기화 완료 상태는 유지됩니다.

```bash
docker compose -f compose.production.yaml up -d --force-recreate backend
shred -u secrets/owner-bootstrap-token
```

`crusthack.com` 운영 배포에서는 Cloudflare Origin CA 인증서와 `compose.cloudflare.yaml`을 함께 사용합니다. Cloudflare SSL/TLS 모드는 `Full (strict)`이어야 하며 Nginx는 HTTP를 HTTPS로 이동시키고 Cloudflare의 실제 방문자 IP를 Backend로 전달합니다.

```bash
deploy/scripts/production-preflight.sh --cloudflare --bootstrap
docker compose -f compose.production.yaml -f compose.cloudflare.yaml -f compose.bootstrap.yaml up -d --build
```

Owner 생성 후 운영 명령에서는 Bootstrap override만 제외합니다.

```bash
deploy/scripts/production-preflight.sh --cloudflare
docker compose -f compose.production.yaml -f compose.cloudflare.yaml up -d
```

첫 배포의 전체 순서와 수동 확인 항목은 [deploy/FIRST_DEPLOY.md](deploy/FIRST_DEPLOY.md)에 정리되어 있습니다.
최초 배포 이후 GitHub Actions 자동 배포 설정과 롤백 절차는 [deploy/GITHUB_ACTIONS_CD.md](deploy/GITHUB_ACTIONS_CD.md)를 참고합니다.

빈 폴더의 기본 프로젝트 생성부터 Windows 개발, Docker 검증, EC2 첫 배포와 운영 명령까지 따라 하는 교안은 [docs/PROJECT_SETUP_AND_DEPLOYMENT_GUIDE.md](docs/PROJECT_SETUP_AND_DEPLOYMENT_GUIDE.md)를 참고합니다.

## 검증

```bash
npm run lint:frontend
API_SERVER_URL=http://localhost:5268 npm run build:frontend
npm run test:backend
docker compose -f compose.production.yaml config
```
