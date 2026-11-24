# Blog

Next.js Frontend와 ASP.NET Core Backend를 한 저장소에서 관리하는 모노레포입니다.

현재 주요 기능은 다음과 같습니다.

- 일회용 Setup Code를 이용한 최초 Owner 계정 생성
- 초대 코드 기반 Member 가입과 HttpOnly 세션 쿠키 로그인·로그아웃
- Markdown 포스트 작성, 실시간 미리보기, 명시적 저장과 편집 충돌 감지
- 작성자·Owner 권한에 따른 즉시 게시, 편집, 휴지통 이동과 복원
- 글별 공개·비공개·코드로 열람 설정과 첨부 파일 접근 제어
- 공개 포스트 목록 및 본문 조회
- 커뮤니티 게시판형 글 목록, 검색·필터·정렬과 20개 단위 페이지 탐색
- Markdown 댓글·답글, 북마크, 신고와 Owner 운영 도구
- Owner용 전체 게시글 관리: 제목·설명 검색, 카테고리·공개 범위 필터, 편집과 삭제
- 카테고리 생성·조회·수정·숨김·정렬·삭제와 글 분류
- 카테고리별 탐색과 제목·설명 검색
- 반응형 문서형 블로그 레이아웃과 소개 페이지
- Markdown 서식 삽입 도구, 계층형 목차와 코드 복사
- 관리자 전용 글별 이미지·문서·압축파일 첨부, 이름 변경·삭제와 메타데이터 아래 다운로드 목록
- 슬라이드 보기, 메모·드로잉, 브라우저 및 계정별 서버 작업 공간
- 통합 사이트 관리, 첨부 파일 정합성 점검과 관리자 전용 클라우드
- Owner용 외부 사이트 메뉴 설정
- 로컬 웹게임 4종과 API·SQLite·배포 버전 상태 확인

기존 프로젝트의 이미지·첨부 파일, 슬라이드 작업 공간과 커뮤니티 기능은 현재
인증·저장 구조에 맞게 이식했습니다. 관리자는 Markdown 폴더에서 글을 일괄로
가져올 수 있습니다. 완료 범위와 남은 순서는
[기능 이식 현황과 로드맵](docs/FEATURE_MIGRATION_ROADMAP.md)에 정리되어 있습니다.

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

브라우저에서 `http://localhost:3000/login`을 열고 로컬 개발 Owner로 로그인합니다. 상단의 `새 글` 메뉴에서 Markdown 포스트를 작성하고 `게시하기`를 누르면 선택한 공개 범위로 저장됩니다. 새 글은 기본적으로 비공개이며 공개하려면 공개 범위를 직접 변경합니다. 카테고리 화면의 글쓰기와 상단 새 글 메뉴는 현재 카테고리를 미리 선택합니다. 전체 글 목록에서 카테고리를 필터링한 경우에도 목록의 글쓰기에 해당 분류가 적용됩니다. 수정 내용도 저장 즉시 반영됩니다.
`사이트 관리`의 카테고리 도구에서는 분류와 노출 순서를 관리할 수 있고 글 편집기에서
카테고리를 선택할 수 있습니다. 관리자는 글을 한 번 저장한 뒤 이미지·문서·압축파일을 첨부하고
Markdown 문법을 현재 커서 위치에 삽입할 수 있습니다. 사이트 설정에서는 상단 외부
사이트 목록을 관리합니다. 공개 화면은 카테고리별 URL과 제목·설명 검색을 제공하며
footer의 `서비스 상태`에서 API와 SQLite 연결 상태를 확인할 수 있습니다.

전체 글은 상단 카테고리 메뉴의 `전체 글`(`/posts`)에서 확인합니다. Owner는
`사이트 관리`의 게시글 도구(`/admin#posts`)에서 비공개 글과 숨긴 카테고리의 글도
함께 관리할 수 있습니다. 기존 `/posts/manage` 주소도 유지합니다. 목록은
번호·분류·제목·공개 범위·날짜를 한 줄씩 표시하며, 모바일에서는 제목을 우선해 일부
열을 숨깁니다.

## 운영 배포 환경

### 글 공개 범위

편집기의 `공개 범위`에서 다음 중 하나를 선택합니다. 초안이나 별도 발행 단계 없이 저장 즉시 적용됩니다.

| 범위 | 방문자 목록·검색 | 본문·첨부 파일 |
| --- | --- | --- |
| 공개 | 제목·설명 표시 | 누구나 열람 |
| 비공개 | 숨김 | 작성자와 Owner만 열람 |
| 코드로 열람 | 제목·설명 표시 | 작성자·Owner 또는 글별 접근 코드 인증 후 열람 |

접근 코드는 4~128자이며 서버에는 단방향 해시만 저장합니다. 수정 화면에서 코드를 비워 두면 기존 코드를 유지하고, 새 코드를 저장하면 기존 열람 권한이 무효화됩니다. 공개 범위를 변경해도 기존 권한을 무효화합니다. 카테고리를 숨기면 그 안의 글은 작성자와 Owner만 열람할 수 있으며 게시글 관리에서는 비공개로 표시됩니다. 카테고리를 다시 공개하면 각 글에 저장된 공개 범위가 적용됩니다.

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

## 포스트 주소와 목차

- 포스트 주소는 `/posts/{카테고리 slug}/{글번호}`이며, 미분류 글은 `/posts/uncategorized/{글번호}`를 사용합니다.
- 기존 글도 현재 카테고리에서 주소를 계산하므로 데이터 마이그레이션이 필요 없습니다. `/posts/{글번호}`나 이전 카테고리 주소로 접속하면 글 조회 후 브라우저 주소를 현재 경로로 교체합니다. 쿼리와 본문 위치(`#...`)는 유지합니다.
- 본문 제목으로 오른쪽 목차를 자동 생성하고 현재 읽는 구간을 표시합니다. `blog-private`의 TOC처럼 최상위 제목은 항상 표시하고, 현재 제목의 상위 경로와 그 자식 제목만 펼칩니다. 작은 화면에서는 본문 위에 표시합니다. 보호된 글은 접근 코드를 확인한 후에만 목차가 나타납니다.

## 통합 사이트 관리

운영자 메뉴의 **사이트 관리** 또는 `/admin`에서 전체 현황과 관리 도구를 함께
사용합니다.

- 게시글·댓글·회원·미처리 신고·휴지통·초대·등록 첨부 집계와 최근 수정 글/운영 기록.
- 게시글, 카테고리, 회원, 신고, 초대, 사이트 설정, 휴지통, 파일 점검, 감사 기록, 서비스 상태를 페이지 안에서 전환.
- `/admin#settings`처럼 도구를 바로 열 수 있고 브라우저 뒤로/앞으로 이동도 지원합니다.
- 열린 도구는 화면 전환 시 유지되어 입력 중인 설정이 사라지지 않습니다. 서버 저장은 기존 저장 버튼으로만 실행합니다. 페이지를 떠나거나 새로고침할 때의 입력 보존을 뜻하지는 않습니다.
- **카테고리 → 상단 카테고리 바로가기**에서 공개 카테고리 하나를 골라 우측 상단에 표시할 수 있습니다. 숨긴 카테고리의 바로가기는 공개 상태로 돌아오면 다시 표시됩니다.
- **카테고리 → 카테고리 트리**에서 여러 최상위 카테고리와 하위 가지를 확인하고, 가지별로 또는 한꺼번에 접고 펼칠 수 있습니다. 여러 항목을 체크한 뒤 **선택 이동**을 누르거나 체크한 항목 하나를 끌어 함께 옮깁니다. 부모와 자식을 같이 선택하면 기존 계층이 유지됩니다.
- 상단 카테고리 메뉴에는 공개된 최상위 카테고리가 표시됩니다. 카테고리 페이지에서 하위 카테고리를 열 수 있습니다. 상위 카테고리를 숨기면 그 아래의 하위 카테고리와 글도 함께 숨겨집니다.
- 현황은 전체 현황으로 돌아올 때 다시 조회합니다. 파일 수/용량은 DB 등록 기준이며 실제 파일 정합성 점검은 첨부 파일 도구에서 실행합니다.
- 기존 개별 관리 주소는 해당 `/admin#...` 도구로 자동 이동하므로 북마크와 이전 링크도 계속 사용할 수 있습니다. 현황 API는 Owner만 접근할 수 있습니다.

## Markdown 폴더 업로드

Owner로 로그인한 뒤 **사이트 관리 → 폴더 업로드**에서 `blog-legacy/posts` 같은
폴더를 선택합니다. 하위 폴더의 `.md`와 `.mdx` 파일까지 읽고, 각 파일의 바로 위
폴더 이름을 카테고리로 사용합니다. 예를 들어 `posts/Theory/Network/tcp.mdx`는
`Network`, `posts/example.md`는 `posts`로 분류됩니다.

목록에서 가져올 파일을 고르고 공개 범위를 선택합니다. 기본값은 비공개입니다.
이름이 같은 카테고리는 재사용하고 필요한 카테고리는 새로 생성합니다. YAML의
`title`, `description`, 유효한 `YYYY-MM-DD` 형식의 `date`를 읽으며, 제목이 없으면
파일명을 사용합니다. 같은 카테고리에 제목·설명·본문이 같은 글이 있으면 건너뜁니다.
한 번에 최대 200개 또는 요청 크기 16 MiB까지 가져올 수 있습니다.

이미지는 기존 첨부 기능으로 올릴 수 있습니다. 본문에 남아 있는 이미지 경로,
내부 링크, MDX 전용 문법은 가져온 뒤 해당 글에서 편집합니다.

## 검증 명령

회원 참여·운영 기능과 후속 인프라 계획은
[마크다운 커뮤니티 구현 현황](docs/COMMUNITY_EVOLUTION.md)을 참고합니다. `/admin`의
사이트 관리 화면에서 초대를 발급하고 회원·신고를 관리합니다.

편집기와 읽기 화면의 개선 사항은 [사용성 개선 기록](docs/PRODUCT_IMPROVEMENTS.md)에 정리되어 있습니다.

슬라이드뷰, 메모, 드로잉, 저장 정책과 단축키는 [슬라이드 작업 공간](docs/SLIDE_WORKSPACE.md)을 참고합니다.

휴지통·복원, 슬라이드 서버 저장과 첨부 파일 점검의 구현 범위 및 운영 반영은 [로드맵 반영 현황](docs/ROADMAP_PROGRESS.md)을 참고합니다.

```bash
npm run lint:frontend
npm run test:frontend
API_SERVER_URL=http://localhost:5268 npm run build:frontend
npm run test:backend
dotnet tool restore
dotnet ef migrations has-pending-model-changes --project apps/backend/Blog.Api.csproj
docker compose -f compose.production.yaml config
```

테스트 수는 기능 추가에 따라 달라지므로 위 명령의 결과를 현재 기준으로 사용합니다.
CI도 같은 프런트엔드 테스트와 백엔드 통합 테스트를 실행합니다.

### 게시글 정렬과 삭제

- 사이트 관리 → 게시글에서 관리자만 우선순위(0~10,000)를 지정하고 저장할 수 있습니다. 숫자가 클수록 먼저 표시하고, 같으면 최신 글순입니다. 기존 글은 0으로 시작합니다.
- 전체 글·카테고리 목록의 기본 정렬은 우선순위순이며 최신·오래된·수정일·제목순도 선택할 수 있습니다. 최근 글 사이드바는 최신 글순을 유지합니다.
- 본문의 수정·삭제는 작성자와 관리자에게 표시합니다. 삭제 시 확인 후 휴지통으로 이동하며 관리자가 복원할 수 있습니다.

### 관리자 클라우드

`/admin#drive`에서 관리자 전용 폴더·파일 보관함을 사용합니다. 업로드·다운로드·이름 변경·이동·휴지통·복원을 지원합니다. [사용 및 운영 안내](docs/ADMIN_DRIVE.md)를 참고하세요.

### 게시글 첨부 파일

관리자는 게시글 설명·메타데이터 아래의 `파일 첨부·관리`에서 업로드할 수 있습니다. 열람자는 회색 첨부 목록에서 다운로드합니다. 지원 형식과 권한은 [첨부 파일 안내](docs/POST_ATTACHMENTS.md)를 참고하세요.
