# Blog 완전 재구축 실습 교안

이 교안은 완성 저장소를 실행하는 설명서가 아니라, **빈 실습 폴더에서 현재 Blog를
단계별로 다시 구성하는 학습 과정**이다. 각 장의 설명을 읽고 바로 아래 PowerShell
또는 Bash 블록을 그대로 붙여 넣으면 소스, 환경 설정, 테스트, Docker, EC2와
GitHub Actions CD까지 같은 구조로 재현할 수 있다.

전체 스캔과 실행 검증일은 2026-09-03이며, 작성 기준 기능 커밋은
`07547ff006f0020a8779bb007d232e5460debc7e`이다. 교안만 수정된 이후 커밋에서도
애플리케이션 소스가 바뀌지 않았다면 같은 결과가 나온다.

> 이 교안에서 “동일”은 Git 이력이나 자동 생성 시각까지 같은 바이트 단위 복제가
> 아니라, 같은 소스·설정·의존성·DB schema·테스트·배포 동작을 가진 저장소를 뜻한다.

## 0. 학습 결과와 사용 방법

완료하면 다음을 직접 설명하고 재현할 수 있어야 한다.

- npm workspace 안에 Next.js 16 Frontend와 ASP.NET Core 10 Backend 구성
- SQLite와 EF Core migration, ASP.NET Core Identity 기반 Owner 인증
- 최초 한 번만 허용되는 Setup Code 기반 Owner 생성
- Markdown 글 CRUD, 초안/공개 권한, 카테고리, 검색
- Next.js rewrite를 이용한 동일 출처 API 호출
- non-root 다단계 Docker 이미지와 Nginx reverse proxy
- Docker volume에 DB와 Data Protection key 영속화
- Cloudflare Origin CA 기반 HTTPS
- GitHub Actions CI 후 검증된 commit SHA만 EC2에 배포
- 배포 전 백업, release symlink 전환, health check와 코드 rollback

### 교안의 세 가지 진행 방식

1. **권장: 단계별 정확 복사 방식**
   완성 저장소를 읽기 전용 교재로 두고 빈 실습 폴더에 장별 파일만 복사한다.
   명령 한 블록으로 오탈자 없이 현재 코드가 만들어지며, 복사 전후에 해당 파일을
   직접 읽고 설명한다.
2. **빠른 재현 방식**
   먼저 한 블록으로 전체 추적 파일을 복사·검증한 뒤, 각 장을 읽으며 완성 코드를
   역방향으로 학습한다.
3. **수기 방식**
   각 장의 파일 목록을 열어 내용을 새 파일에 직접 붙여 넣는다. 아래의
   `Copy-LessonFiles` 호출 대신 VS Code에서 원본과 실습 파일을 나란히 열면 된다.

교재 저장소를 복사해서 실행하는 것이 목적이 아니다. `blog-reference`는 답안이고,
`blog-learning`이 실제로 만드는 결과물이다.

명령의 `<GITHUB_USER>`, `<REPOSITORY>`, `<EC2_ELASTIC_IP>`는 실행 전에 자신의 값으로
바꾸며 꺾쇠 자체는 입력하지 않는다. 코드 블록 표제의 `powershell`, `cmd`, `bash`를
확인하고 해당 shell에서만 실행한다.

## 1. 전체 스캔 결과

현재 저장소는 Git 추적 파일 95개로 구성된다.

| 영역 | 파일 수 | 핵심 역할 |
|---|---:|---|
| Backend | 31 | API, Identity, EF Core, migration, Dockerfile |
| Frontend | 32 | App Router, 인증 상태, 글·카테고리 UI, CSS, Dockerfile |
| Tests | 6 | Setup, 환경 격리, 글과 카테고리 통합 테스트 |
| Deploy/Compose | 13 | Compose override, Nginx, 백업과 release 배포 |
| GitHub Actions | 2 | CI와 EC2 CD |
| Docs | 2 | 본 교안과 기능 이식 로드맵 |
| Root | 9 | workspace, lockfile, solution, ignore 정책 |

### 현재 제공 기능

- Owner 최초 생성, 로그인, 로그아웃과 IP별 로그인 요청 제한
- Owner만 글 생성·수정·삭제 및 초안 조회
- 방문자는 공개 글과 공개 카테고리만 조회
- Markdown 및 GFM 렌더링과 편집 미리보기
- 제목·설명 검색, 카테고리 필터, 예상 읽기 시간
- 반응형 문서형 디자인, 소개 화면
- Docker/Nginx/Cloudflare 운영 구성
- Backend 테스트, Frontend lint/build, Compose/Nginx CI
- GitHub-hosted runner에서 EC2로 SCP/SSH 배포

### 아직 없는 기능

- 이미지 업로드·관리
- 글별 접근 코드
- 게시물 import/export
- MDX 사용자 컴포넌트와 슬라이드 모드
- 카테고리 수정 UI(API는 존재)
- 글 삭제 UI(API는 존재)
- 페이지네이션, 전문 검색, 다중 Owner

이 항목은 [기능 이식 로드맵](FEATURE_MIGRATION_ROADMAP.md)에 별도로 정리되어 있다.

## 2. 완성 구조를 먼저 이해하기

### 요청 흐름

```text
로컬 개발
브라우저 :3000
  └─ /api/* → Next.js rewrite → ASP.NET Core :5268

운영
브라우저 → Cloudflare → EC2 :443 → Nginx
                                  ├─ /api/* → Backend :8080
                                  └─ 나머지 → Frontend :3000
```

Frontend와 Backend를 브라우저에서 서로 다른 origin으로 노출하지 않으므로 CORS를
추가하지 않는다. 쿠키는 `/api/auth/login` 응답에서 같은 사이트에 설정되고 모든
관리 요청은 `credentials: "include"`로 전송된다.

### 데이터 흐름

```text
ASP.NET Core
  ├─ SQLite              /app/runtime/blog.db
  └─ Data Protection key /app/runtime/data-protection/
                 │
                 └─ Docker volume blog_blog_runtime

Cloudflare 인증서와 Setup Code
  └─ /srv/blog/shared/secrets → 각 release의 secrets symlink
```

### 배포 흐름

```text
main push
  → CI 3개 job 성공
  → CD가 같은 commit SHA checkout
  → Git archive 생성(secrets 제외)
  → EC2 /var/tmp로 SCP
  → /srv/blog/releases/<SHA>에 해제
  → 이전 runtime 백업
  → current symlink 교체
  → docker compose up --build
  → Frontend/API health check
  → 실패하면 이전 코드 release 복원
```

DB migration은 Backend 시작 시 자동 적용된다. 이미 적용된 migration은 코드
symlink만 되돌려도 취소되지 않으므로 schema 변경 배포에는 별도 복구 계획이 필요하다.

## 3. 도구 설치와 버전 고정

이 snapshot에서 검증한 버전은 다음과 같다.

| 도구 | 기준 버전 |
|---|---|
| Git | 2.55.x |
| Node.js | 24.x |
| npm | 11.x |
| .NET SDK | 10.0.x |
| dotnet-ef | 10.0.11 |
| Next.js | 16.3.3 |
| React/React DOM | 19.2.8 |
| TypeScript | 5.9.x |
| Docker Engine/Compose | Ubuntu 공식 저장소의 현재 안정판 |
| Nginx image | 1.30.4-alpine |

관리자 PowerShell에서 설치한다.

```powershell
winget install --exact --id Git.Git
winget install --exact --id OpenJS.NodeJS.LTS
winget install --exact --id Microsoft.DotNet.SDK.10
winget install --exact --id Docker.DockerDesktop
```

새 PowerShell에서 확인한다.

```powershell
git --version
node --version
npm --version
dotnet --version
docker version
docker compose version
```

Docker Desktop은 한 번 직접 실행하고 Linux container 모드가 준비될 때까지 기다린다.
`docker version`에 Client만 나오고 Server가 없으면 아직 다음 장으로 넘어가지 않는다.

## 4. 교재와 빈 실습 저장소 준비

### 4.1 경로 설정

이미 가지고 있는 완성 저장소를 교재로 사용한다. 다른 PC라면 아래 블록으로
`Documents\blog` 아래에 교재와 실습 경로를 준비한다.

```powershell
$CourseRoot = Join-Path $env:USERPROFILE 'Documents\blog'
New-Item -ItemType Directory -Force -Path $CourseRoot | Out-Null
Set-Location $CourseRoot
git clone https://github.com/crusthack/blog.git blog-reference
$ReferenceRoot = (Resolve-Path (Join-Path $CourseRoot 'blog-reference')).Path
$LabRoot = Join-Path $CourseRoot 'blog-learning'
```

현재 PC처럼 `C:\Users\jin\Documents\blog\blog`이 이미 완성 저장소라면 위 clone
블록 대신 다음 두 줄을 실행한다.

```powershell
$ReferenceRoot = (Resolve-Path 'C:\Users\jin\Documents\blog\blog').Path
$LabRoot = 'C:\Users\jin\Documents\blog\blog-learning'
```

두 경우 모두 `blog-learning`은 비어 있는 새 경로여야 한다. 이제 공통 준비 블록을
붙여 넣는다.

```powershell
New-Item -ItemType Directory -Force -Path $LabRoot | Out-Null
if ((Get-ChildItem -LiteralPath $LabRoot -Force | Measure-Object).Count -ne 0) {
    throw "실습 폴더가 비어 있지 않습니다: $LabRoot"
}

function Copy-LessonFiles {
    param([Parameter(Mandatory)][string[]]$Paths)

    foreach ($relativePath in $Paths) {
        $source = Join-Path $ReferenceRoot $relativePath
        $destination = Join-Path $LabRoot $relativePath
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            throw "교재 파일이 없습니다: $relativePath"
        }
        New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Force
        Write-Host "copied $relativePath"
    }
}

Set-Location $LabRoot
git init -b main
```

PowerShell 창을 닫으면 변수와 함수가 사라진다. 다시 열었을 때는 자신의 경로를
지정하는 `$ReferenceRoot`/`$LabRoot` 줄과 `Copy-LessonFiles` 함수 정의만 다시
실행한다. `New-Item`, 빈 폴더 검사와 `git init`은 최초 한 번만 실행한다.

### 4.2 선택 사항: 한 번에 재현하는 빠른 모드

구조를 먼저 완성해 실행하고 나중에 코드를 읽고 싶다면 다음 블록을 한 번만 실행한다.
이 모드를 선택한 경우 5장부터 나오는 `Copy-LessonFiles` 블록은 이미 완료된 것이므로
다시 실행하지 않아도 된다.

```powershell
$allTrackedFiles = @(git -C $ReferenceRoot ls-files)
Copy-LessonFiles -Paths $allTrackedFiles

Set-Location $LabRoot
npm ci
dotnet tool restore
dotnet restore Blog.slnx
dotnet format Blog.slnx --verify-no-changes --no-restore
dotnet test Blog.slnx --configuration Release --no-restore
dotnet ef migrations has-pending-model-changes --project apps/backend
npm run lint:frontend
$env:API_SERVER_URL = 'http://backend:8080'
npm run build:frontend
Remove-Item Env:API_SERVER_URL
git add --intent-to-add --all
git diff --check
```

완료 후 5장부터 순서대로 읽으면서 각 파일의 역할을 확인한다. Docker가 설치되어
있다면 14.4절부터 production 동작도 검증한다.

### 4.3 왜 clone 한 번으로 끝내지 않는가

장별로 일부 파일만 복사하면 다음 의존 관계를 눈으로 확인할 수 있다.

```text
Model → DbContext → Migration → Service → Controller → Contract → Component → Page
```

각 장 끝에서 테스트하고 commit하면 어느 단계에서 동작이 생겼는지도 추적할 수 있다.

## 5. 1단계: 모노레포 뼈대와 의존성

### 5.1 기본 폴더와 root 설정 복사

```powershell
Copy-LessonFiles @(
    '.dockerignore',
    '.gitattributes',
    '.gitignore',
    'Blog.slnx',
    'dotnet-tools.json',
    'package.json',
    'package-lock.json',
    'secrets/.gitkeep'
)
```

핵심 원칙은 다음과 같다.

- root `package.json`은 `apps/frontend`만 npm workspace로 등록한다.
- `Blog.slnx`는 Backend와 테스트 프로젝트를 한 번에 복원·검증한다.
- `secrets/*`는 무시하고 빈 디렉터리 유지용 `.gitkeep`만 추적한다.
- `.gitattributes`의 `/secrets export-ignore`는 `git archive`에 secrets 경로가
  들어가지 않게 한다.
- `.dockerignore`는 개발 설정, DB, 테스트, 비밀 파일을 image build context에서 뺀다.

`package-lock.json`은 8천 줄이 넘는 생성물이다. 직접 작성하지 않고 정확한 snapshot을
복사한 뒤 `npm ci`를 사용한다. 임의로 `npm install`을 실행해 lockfile을 바꾸지 않는다.

### 5.2 패키지와 도구 복원 시점

아직 `apps/backend/Blog.Api.csproj`, `tests/Blog.Api.Tests/Blog.Api.Tests.csproj`,
`apps/frontend/package.json`을 복사하지 않았으므로 여기서는 restore를 실행하지 않는다.
Backend는 6.1절에서 프로젝트 단위로, solution 전체는 9장에서, npm workspace는
10장에서 처음 복원한다. 이렇게 하면 학습 중간에 "예상된 실패"를 만들지 않고 모든
명령 블록이 위에서 아래로 성공한다.

예상 핵심 의존성:

```text
Backend: ASP.NET Core Identity EF 10.0.11, EF Core SQLite/Design 10.0.11
Frontend: Next 16.3.3, React 19.2.8, react-markdown 10.1, remark-gfm 4.0
Tests: xUnit 2.9.3, Mvc.Testing 10.0.11, SQLite 10.0.11
```

root 파일의 역할만 확인하고 다음 단계로 이동한다.

## 6. 2단계: Backend 데이터 계층

### 6.1 프로젝트와 모델 복사

```powershell
Copy-LessonFiles @(
    'apps/backend/Blog.Api.csproj',
    'apps/backend/appsettings.json',
    'apps/backend/appsettings.Development.json',
    'apps/backend/Properties/launchSettings.json',
    'apps/backend/Auth/Roles.cs',
    'apps/backend/Models/ApplicationUser.cs',
    'apps/backend/Models/SiteInstallation.cs',
    'apps/backend/Models/Post.cs',
    'apps/backend/Models/Category.cs',
    'apps/backend/Data/BlogDbContext.cs'
)

dotnet restore apps/backend/Blog.Api.csproj
```

직접 프로젝트를 생성하며 비교하고 싶다면 별도 임시 폴더에서 다음 생성 명령을
실행한다. 생성 결과는 답안 파일과 같지 않으므로 실습 저장소에 덮어쓰지 않는다.

```powershell
$DotnetScratch = Join-Path $env:TEMP ('blog-dotnet-scratch-' + [guid]::NewGuid().ToString('N'))
dotnet new webapi -n Blog.Api -o (Join-Path $DotnetScratch 'backend') --use-controllers
dotnet new xunit -n Blog.Api.Tests -o (Join-Path $DotnetScratch 'tests')
Write-Host "생성기 비교 폴더: $DotnetScratch"
```

### 6.2 모델 관계 이해

| 모델 | 핵심 필드 | 관계/제약 |
|---|---|---|
| `ApplicationUser` | Identity 필드, `CreatedAtUtc` | Guid PK |
| `SiteInstallation` | 초기화·진행 상태, Owner ID | ID=1 singleton, Owner 삭제 Restrict |
| `Post` | 번호, 제목, 설명, Markdown, 상태, 시간 | 번호 unique, Owner Restrict, Category SetNull |
| `Category` | 이름, slug, 설명, 순서, 공개 여부 | slug unique, 여러 Post |

`SiteInstallation.IsInitializationInProgress`는 두 개의 Owner 생성 요청이 동시에
도착해도 한 요청만 row를 선점하도록 사용한다. `PostNumber`는 URL에 노출되는 순번이고
내부 PK는 Guid다.

### 6.3 migration snapshot 복사

현재 저장소와 같은 migration 이력을 만들려면 생성 파일을 그대로 복사한다.

```powershell
Copy-LessonFiles @(
    'apps/backend/Data/Migrations/20260829145256_InitialIdentity.cs',
    'apps/backend/Data/Migrations/20260829145256_InitialIdentity.Designer.cs',
    'apps/backend/Data/Migrations/20260829153304_AddBasicPosts.cs',
    'apps/backend/Data/Migrations/20260829153304_AddBasicPosts.Designer.cs',
    'apps/backend/Data/Migrations/20260829155222_UseUtcPostTimestamps.cs',
    'apps/backend/Data/Migrations/20260829155222_UseUtcPostTimestamps.Designer.cs',
    'apps/backend/Data/Migrations/20260903000000_AddCategories.cs',
    'apps/backend/Data/Migrations/BlogDbContextModelSnapshot.cs'
)
```

`20260903000000_AddCategories.cs`는 일반적인 `dotnet ef migrations add` 결과와 달리
직접 작성된 SQLite DDL과 `[Migration]` 특성을 사용하며 대응하는 `.Designer.cs`가
없다. 따라서 기존 이력을 정확히 재현할 때는 파일명을 바꾸거나 다시 생성하지 말고
위 목록과 snapshot을 그대로 복사한다. `UseUtcPostTimestamps`의 `Up`/`Down`이 빈 것도
현재 migration 이력의 일부다.

새 프로젝트라서 과거 migration 이름까지 같을 필요가 없다면 최종 모델에서 하나의
새 migration을 생성할 수도 있다. 단, 이 명령은 8.1절에서 `Program.cs`와 모든
Controller까지 조립한 뒤 실행한다.

```powershell
dotnet tool restore
dotnet ef migrations add InitialBlogSchema --project apps/backend
```

두 방식을 동시에 사용하면 안 된다. 이 교안의 정확 재현 과정에서는 복사 방식을
사용한다.

정확 재현 과정에서는 지금 local tool만 복원한다.

```powershell
dotnet tool restore
```

Migration 확인은 실행 가능한 Backend가 완성되는 8.3절에서 수행한다.

## 7. 3단계: 최초 Owner와 인증

### 7.1 Setup 계층 복사

```powershell
Copy-LessonFiles @(
    'apps/backend/Setup/BootstrapOptions.cs',
    'apps/backend/Setup/BootstrapTokenProvider.cs',
    'apps/backend/Setup/CreateOwnerRequest.cs',
    'apps/backend/Setup/DevelopmentOwnerOptions.cs',
    'apps/backend/Setup/DevelopmentOwnerInitializer.cs',
    'apps/backend/Setup/OwnerSetupService.cs',
    'apps/backend/Controllers/SetupController.cs',
    'apps/backend/Controllers/AuthController.cs'
)
```

### 7.2 두 환경의 Owner 정책

| 항목 | Development | Production |
|---|---|---|
| 계정 생성 | 시작할 때 `localdev` 자동 동기화 | `/setup`에서 한 번만 생성 |
| 비밀번호 | `password` | 사용자가 입력한 8자 이상 값 |
| Setup Code | 사용 안 함 | 32 random bytes를 hex 64자로 저장 |
| Cookie Secure | 요청 scheme에 따름 | 항상 Secure |
| 잘못된 개발 계정 설정 | 허용 | Backend 시작 자체를 거부 |

운영 Setup Code는 환경 변수 문자열로 직접 전달하지 않는다. 파일 경로만
`BLOG_BOOTSTRAP__TOKENFILE`로 전달하고, 비교할 때 SHA-256과 fixed-time comparison을
사용한다.

### 7.3 Identity 설정의 보안 불변식

- Cookie 이름은 `blog.session`이다.
- `HttpOnly`, `SameSite=Strict`, 운영 `Secure=Always`를 사용한다.
- API 요청에서 로그인 redirect 대신 401, 권한 부족은 403을 반환한다.
- 로그인 15분당 IP별 10회, Owner setup 15분당 IP별 5회로 제한한다.
- Identity에는 5회 실패/15분 lockout 옵션이 설정되어 있다. 다만 현재 Owner 생성
  코드가 `LockoutEnabled = true`를 저장하지 않아 **계정 lockout은 실제로 활성화되지
  않는다**. 현재 유효한 방어선은 앞 항목의 IP별 rate limit이다.
- Owner 역할은 `Owner` 하나다.

## 8. 4단계: 글·카테고리 API와 애플리케이션 조립

```powershell
Copy-LessonFiles @(
    'apps/backend/Controllers/PostsController.cs',
    'apps/backend/Controllers/CategoriesController.cs',
    'apps/backend/Program.cs',
    'apps/backend/Blog.Api.http'
)
```

### 8.1 API 계약표

| Method | Path | 익명 | Owner | 동작 |
|---|---|---:|---:|---|
| GET | `/api/health` | O | O | DB 연결 확인 |
| GET | `/api/setup/status` | O | O | 초기화 필요 여부 |
| POST | `/api/setup/owner` | O | O | 최초 Owner 1명 생성 |
| POST | `/api/auth/login` | O | O | 세션 cookie 발급 |
| GET | `/api/auth/me` | X | O | 현재 사용자 |
| POST | `/api/auth/logout` | X | O | 세션 종료 |
| GET | `/api/posts` | O | O | 방문자는 공개 글, Owner는 초안 포함 |
| GET | `/api/posts/{number}` | O | O | 초안은 Owner만 조회 |
| POST | `/api/posts` | X | O | 글 생성 |
| PUT | `/api/posts/{number}` | X | O | 글 수정·게시 전환 |
| DELETE | `/api/posts/{number}` | X | O | 글 삭제 |
| GET | `/api/categories` | O | O | 방문자는 공개 분류만 조회 |
| POST | `/api/categories` | X | O | 분류 생성 |
| PUT | `/api/categories/{id}` | X | O | 분류 수정 |
| DELETE | `/api/categories/{id}` | X | O | 연결 글이 없을 때 삭제 |

글 목록의 `query`는 제목과 설명의 부분 문자열만 검색한다. `categoryId`와 함께
사용할 수 있다. slug는 소문자 영문·숫자·하이픈만 허용한다.

현재 상세 API는 글의 공개 여부만 검사하고 연결 카테고리의 `IsVisible`은 검사하지
않는다. 따라서 숨김 카테고리의 공개 글은 목록에서는 빠지지만 번호를 아는 사용자가
`/api/posts/{number}`로 직접 조회할 수 있다. 이는 현재 동작을 정확히 기록한 것이며,
일관된 공개 정책이 필요하면 별도 수정과 회귀 테스트가 필요하다.

### 8.2 `Program.cs` 조립 순서

완성 코드를 읽을 때 다음 순서로 구분한다.

1. `BLOG_` prefix 환경 변수 추가
2. runtime과 Data Protection 디렉터리 생성
3. Controller, ProblemDetails, Forwarded Headers 등록
4. 개발/운영 Owner 설정 격리
5. SQLite DbContext와 Identity cookie 등록
6. Setup/Login rate limiter 등록
7. middleware 순서 설정
8. health endpoint와 Controller map
9. migration 적용 후 개발 Owner 초기화

Forwarded Headers는 임의 proxy를 신뢰하지 않고 Compose 고정 subnet
`172.30.0.0/24`에서 한 번 전달된 헤더만 신뢰한다.

### 8.3 첫 Backend 실행

먼저 migration 이력과 최종 모델이 일치하는지 확인한다.

```powershell
dotnet ef migrations list --project apps/backend
dotnet ef migrations has-pending-model-changes --project apps/backend
```

두 번째 명령은 pending change가 없다는 결과로 끝나야 한다. 그다음 Backend를
실행한다.

```powershell
Set-Location $LabRoot
npm run dev:backend
```

다른 PowerShell에서 확인한다.

```powershell
Invoke-RestMethod http://localhost:5268/api/health
Invoke-RestMethod http://localhost:5268/api/setup/status
```

Development에서는 migration과 `localdev` Owner가 자동 생성되므로
`requiresSetup`은 `false`다. 종료는 실행 터미널에서 `Ctrl+C`다.

생성되는 `apps/backend/runtime`은 Git에 넣지 않는다.

## 9. 5단계: Backend 통합 테스트

```powershell
Copy-LessonFiles @(
    'tests/Blog.Api.Tests/Blog.Api.Tests.csproj',
    'tests/Blog.Api.Tests/SetupApiFactory.cs',
    'tests/Blog.Api.Tests/OwnerSetupTests.cs',
    'tests/Blog.Api.Tests/EnvironmentIsolationTests.cs',
    'tests/Blog.Api.Tests/BasicPostFlowTests.cs',
    'tests/Blog.Api.Tests/CategoryFlowTests.cs'
)

dotnet restore Blog.slnx
dotnet test Blog.slnx --configuration Release --no-restore
```

현재 예상 결과는 8개 테스트 성공이다.

`SetupApiFactory`는 테스트마다 임시 디렉터리, SQLite 파일과 Setup Code를 만들고
종료할 때 삭제한다. 테스트 환경은 `Testing`이므로 개발 Owner initializer가
등록되지 않는다.

테스트가 보장하는 핵심:

- 잘못된 Setup Code 거부
- 동시에 요청해도 Owner 한 명만 생성
- 운영 환경에 개발 계정 설정이 들어가면 시작 거부
- Owner만 글 작성 가능
- 초안은 익명 사용자에게 404
- 게시 후 익명 조회 가능
- 카테고리 연결과 검색/필터 동작

## 10. 6단계: Frontend 기반 설정과 API 계약

Next.js 16에서는 `next build`가 lint를 대신 실행하지 않으므로 lint와 build를 별도
명령으로 검증한다. 동적 route의 `params`는 Promise이므로 page를 `async`로 만들고
`await params`를 사용한다.

생성기가 만드는 기본 구조를 먼저 비교해 보고 싶다면 아래 명령을 **실습 저장소 밖의
임시 폴더**에서 실행한다. `@latest`는 미래에 결과가 바뀌므로 snapshot과 같은
`16.3.3`을 지정한다. 정확 재현 과정에서는 이 명령을 생략하고 바로 다음 복사 블록을
사용한다.

```powershell
$FrontendScratch = Join-Path $env:TEMP ('blog-next-scratch-' + [guid]::NewGuid().ToString('N'))
npx create-next-app@16.3.3 $FrontendScratch `
  --ts `
  --eslint `
  --tailwind `
  --app `
  --src-dir `
  --use-npm `
  --import-alias "@/*" `
  --agents-md `
  --no-react-compiler `
  --disable-git `
  --skip-install
Write-Host "생성기 비교 폴더: $FrontendScratch"
```

생성되는 기본 `layout.tsx`, `page.tsx`, `globals.css`는 현재 블로그의 답안과 다르다.
`next-env.d.ts`, `.next`, `node_modules`는 직접 작성하거나 commit하지 않는다.

```powershell
Copy-LessonFiles @(
    'apps/frontend/.gitignore',
    'apps/frontend/AGENTS.md',
    'apps/frontend/CLAUDE.md',
    'apps/frontend/package.json',
    'apps/frontend/tsconfig.json',
    'apps/frontend/eslint.config.mjs',
    'apps/frontend/postcss.config.mjs',
    'apps/frontend/next.config.ts',
    'apps/frontend/src/lib/contracts.ts'
)

npm ci
```

현재 날짜의 npm에서는 lockfile에 고정된 ESLint 9.39.5에 대한 지원 종료 경고와
`unrs-resolver` install script 검토 경고가 표시될 수 있다. 이 snapshot은 그대로
lint/build에 성공한다. 경고를 없애려고 학습 도중 임의 upgrade 또는 무검토
`npm approve-scripts`를 실행하지 말고, 의존성 갱신을 별도 작업으로 다룬다.

### `next.config.ts`가 하는 일

- 운영 build에서 `API_SERVER_URL`이 없으면 즉시 실패한다.
- URL protocol은 HTTP 또는 HTTPS만 허용한다.
- `/api/:path*`를 Backend의 `/api/:path*`로 rewrite한다.
- `output: "standalone"`으로 작은 Docker runtime을 만든다.
- `X-Powered-By` header를 제거한다.

로컬 기본 Backend URL은 `http://localhost:5268`, Docker build URL은
`http://backend:8080`이다. `API_SERVER_URL`은 browser에 노출하는
`NEXT_PUBLIC_*` 변수가 아니라 Next.js server/build 설정이다.

## 11. 7단계: Frontend 인증과 Setup UI

```powershell
Copy-LessonFiles @(
    'apps/frontend/src/components/auth/AuthProvider.tsx',
    'apps/frontend/src/components/auth/LoginForm.tsx',
    'apps/frontend/src/components/setup/SetupGuard.tsx',
    'apps/frontend/src/components/setup/OwnerSetupForm.tsx',
    'apps/frontend/src/app/login/page.tsx',
    'apps/frontend/src/app/setup/page.tsx'
)
```

`AuthProvider`, form, guard는 state, event, browser fetch와 router가 필요하므로
Client Component다. `layout.tsx`와 route page는 기본 Server Component로 유지하고
필요한 interactive component만 포함한다.

동작 순서:

1. `/setup` 이외의 route에서 `SetupGuard`가 `/api/setup/status` 호출
2. 초기화 전이면 `/setup`으로 이동
3. Setup form이 code/username/password를 전송
4. 초기화 이후 `AuthProvider`가 `/api/auth/me`로 세션 복원
5. 로그인 성공 시 React context에 사용자 저장
6. 로그아웃 후 홈으로 이동하고 route refresh

## 12. 8단계: 글, 카테고리와 route

### 12.1 기능 component 복사

```powershell
Copy-LessonFiles @(
    'apps/frontend/src/components/posts/MarkdownContent.tsx',
    'apps/frontend/src/components/posts/PostEditor.tsx',
    'apps/frontend/src/components/posts/PostList.tsx',
    'apps/frontend/src/components/posts/PostView.tsx',
    'apps/frontend/src/components/categories/CategoryManager.tsx',
    'apps/frontend/src/components/SiteHeader.tsx',
    'apps/frontend/src/components/SiteFooter.tsx'
)
```

### 12.2 App Router page 복사

대괄호가 포함된 경로 때문에 PowerShell에서는 항상 `-LiteralPath`를 사용하는
복사 함수를 유지한다.

```powershell
Copy-LessonFiles @(
    'apps/frontend/src/app/layout.tsx',
    'apps/frontend/src/app/page.tsx',
    'apps/frontend/src/app/about/page.tsx',
    'apps/frontend/src/app/categories/manage/page.tsx',
    'apps/frontend/src/app/categories/[slug]/page.tsx',
    'apps/frontend/src/app/posts/[postNumber]/page.tsx',
    'apps/frontend/src/app/write/page.tsx',
    'apps/frontend/src/app/write/[postNumber]/page.tsx'
)
```

Route map:

| URL | Page | 내용 |
|---|---|---|
| `/` | `app/page.tsx` | Hero, 분류 rail, 검색, 최근 글 |
| `/about` | `app/about/page.tsx` | 소개 |
| `/setup` | `app/setup/page.tsx` | 최초 Owner 생성 |
| `/login` | `app/login/page.tsx` | Owner 로그인 |
| `/posts/{number}` | 동적 page | 글 본문 |
| `/write` | page | 새 글 |
| `/write/{number}` | 동적 page | 글 편집 |
| `/categories/{slug}` | 동적 page | 분류별 글 |
| `/categories/manage` | page | Owner 분류 관리 |

`PostList`는 먼저 카테고리를 받은 뒤 slug를 ID로 해석하고 글 API를 호출한다.
Owner가 로그인하면 같은 endpoint 응답에 초안과 숨김 카테고리가 포함되므로 인증 상태가
바뀔 때 목록을 다시 불러온다.

`MarkdownContent`는 `react-markdown`과 `remark-gfm`을 사용한다. raw HTML plugin을
사용하지 않으므로 Markdown 속 HTML을 그대로 실행하지 않는다.

모든 브라우저 API 요청은 `fetch("/api/...")` 형태의 same-origin 상대 경로다.
`contracts.ts`는 Backend DTO를 수동으로 맞춘 TypeScript 선언이며 runtime 응답
검증기는 아니다. 로그인 정보는 `localStorage`가 아니라 Backend의 HttpOnly cookie에
보관한다. Client Component의 redirect는 화면 흐름을 위한 것이고 실제 권한은 Backend
Controller가 검사한다.

### 12.3 현재 디자인 그대로 복사

```powershell
Copy-LessonFiles @('apps/frontend/src/app/globals.css')
```

이 파일은 Tailwind import 뒤에 CSS custom property와 일반 class CSS를 함께 사용한다.
현재 시각 결과를 정확히 재현하려면 전체를 복사한다. 기존 스타일과 개선 스타일이
누적되어 중복 selector가 있으므로 향후 refactor 대상이지만, 본 교안에서는 현재
cascade 결과를 유지한다.

### 12.4 Frontend 실행과 확인

Backend를 먼저 실행한 상태에서 새 PowerShell을 연다.

```powershell
Set-Location C:\Users\jin\Documents\blog\blog-learning
npm run dev:frontend
```

브라우저에서 `http://localhost:3000/login`을 열고 로그인한다.

```text
Username: localdev
Password: password
```

확인 순서:

1. 카테고리 생성
2. 새 글을 초안으로 저장
3. 로그아웃하면 초안이 보이지 않는지 확인
4. 다시 로그인해 공개 게시
5. 카테고리 URL과 검색으로 글 확인
6. Markdown 표, 코드, 목록, 인용문 확인

## 13. 9단계: 로컬 품질 검증

```powershell
Set-Location $LabRoot

npm run lint:frontend
$env:API_SERVER_URL = 'http://localhost:5268'
npm run build:frontend
Remove-Item Env:API_SERVER_URL

dotnet format Blog.slnx --verify-no-changes --no-restore
dotnet test Blog.slnx --configuration Release --no-restore
dotnet ef migrations has-pending-model-changes --project apps/backend
git add --intent-to-add --all
git diff --check
```

Next.js의 `PageProps`와 `LayoutProps` type은 `next dev`, `next build` 또는
`next typegen` 실행 중 생성된다. `next-env.d.ts`와 `.next`는 commit하지 않는다.

## 14. 10단계: Docker와 Nginx

### 14.1 컨테이너 관련 파일 복사

```powershell
Copy-LessonFiles @(
    'apps/backend/Dockerfile',
    'apps/frontend/Dockerfile',
    'compose.production.yaml',
    'compose.bootstrap.yaml',
    'compose.cloudflare.yaml',
    'deploy/nginx/nginx.conf',
    'deploy/nginx/nginx.cloudflare.conf',
    'deploy/scripts/create-setup-secret.sh',
    'deploy/scripts/production-preflight.sh',
    'deploy/scripts/backup-runtime.sh'
)
```

### 14.2 Dockerfile 설계

Backend:

- SDK image에서 restore/publish
- ASP.NET runtime image에는 결과와 health용 curl만 포함
- `/app/runtime` 소유권을 `$APP_UID`에 부여
- non-root `$APP_UID`로 실행
- 개발 설정 파일은 publish하지 않음

Frontend:

- dependencies, builder, runtime 3단계
- root workspace lockfile로 `npm ci`
- build 시 내부 Backend URL 주입
- standalone 결과와 static asset만 runtime으로 복사
- non-root `node`로 실행

현재 `node:24-alpine`, .NET 및 Nginx base image tag는 digest까지 고정하지 않았다.
따라서 source와 lockfile은 재현되지만 미래의 container image가 바이트 단위로 같다고
보장하지는 않는다.

### 14.3 Compose 역할 분리

| 파일 | 언제 포함 | 추가되는 것 |
|---|---|---|
| `compose.production.yaml` | 항상 | 3개 service, volume, 내부 network, HTTP |
| `compose.bootstrap.yaml` | Owner 생성 전 | Setup Code Docker secret |
| `compose.cloudflare.yaml` | 실제 domain HTTPS | 인증서 secret과 443 |

Frontend와 Backend는 `expose`만 사용하고 host port를 열지 않는다. Nginx만 80/443을
publish한다. health check와 `depends_on: condition: service_healthy`로 시작 순서를
제어한다.

### 14.4 로컬 Production smoke test

Windows에서는 Git Bash에서 secret을 만든다.

```bash
cd /c/Users/jin/Documents/blog/blog-learning
chmod +x deploy/scripts/*.sh
deploy/scripts/create-setup-secret.sh
deploy/scripts/production-preflight.sh --bootstrap
```

PowerShell에서 실행한다.

```powershell
Set-Location $LabRoot
docker compose -f compose.production.yaml -f compose.bootstrap.yaml up -d --build
docker compose -f compose.production.yaml ps
Invoke-RestMethod http://localhost/api/health
Start-Process http://localhost/setup
```

Setup Code는 Git Bash에서 다음으로 읽되 채팅·화면 공유에 노출하지 않는다.

```bash
cat secrets/owner-bootstrap-token
```

Owner 생성 후 bootstrap override 없이 Backend를 재생성한다.

```powershell
docker compose -f compose.production.yaml up -d --force-recreate backend
docker compose -f compose.production.yaml ps
```

Git Bash에서 Setup Code 파일을 지운다.

```bash
rm -f secrets/owner-bootstrap-token
```

### 14.5 데이터 보존과 백업

컨테이너만 내리면 데이터는 남는다.

```powershell
docker compose -f compose.production.yaml down
```

다음 명령은 DB와 암호화 key까지 지우므로 일반 실습 종료에 사용하지 않는다.

```powershell
# 데이터 전체 삭제를 명확히 의도한 일회성 실습 환경에서만 실행
docker compose -f compose.production.yaml down --volumes
```

Git Bash에서 일관된 백업을 만든다. 스크립트는 Backend를 잠시 멈추고 runtime volume
전체를 묶은 후 다시 시작한다.

```bash
cd /c/Users/jin/Documents/blog/blog-learning
deploy/scripts/backup-runtime.sh
ls -lh backups
```

## 15. 11단계: CI와 release CD 코드 추가

```powershell
Copy-LessonFiles @(
    '.github/workflows/ci.yml',
    '.github/workflows/deploy.yml',
    'deploy/scripts/bootstrap-ec2.sh',
    'deploy/scripts/deploy-release.sh',
    'deploy/scripts/finish-bootstrap.sh',
    'deploy/FIRST_DEPLOY.md',
    'deploy/GITHUB_ACTIONS_CD.md'
)
```

### 15.1 CI의 세 job

| Job | 검증 |
|---|---|
| Backend | restore, format, test, Production publish, 개발 계정 누출 검사 |
| Frontend | Node 24, `npm ci`, ESLint, production build |
| Deployment | 임시 secret/cert, 모든 Compose 조합, shell 문법, Nginx config |

CI는 `main` push와 모든 pull request에 실행되고 read-only contents 권한만 가진다.

### 15.2 CD의 방어 조건

- 성공한 `CI`의 `main` commit만 자동 배포
- 수동 실행도 `main`에서만 허용하고 Backend/Frontend 핵심 검증을 재실행
- 현재 remote `main` HEAD와 SHA가 다르면 오래된 실행 거부
- Git tracked 파일만 archive하며 `secrets` 포함 시 중단
- 서버 host key를 known_hosts로 고정
- private key는 runner 임시 파일로 만들고 항상 제거
- GitHub Actions의 production 동시 배포는 하나씩 실행

수동 실행은 Backend restore/format/test와 Frontend install/lint/build를 재검증한다.
Compose 조합, Nginx 설정, shell syntax까지 포함한 Deployment CI job 전체를 다시
실행하는 것은 아니다. 또한 서버의 배포 명령 자체에는 `flock`이 없으므로 관리자가
동시에 직접 `/usr/local/sbin/deploy-blog`를 실행하지 않는다.

### 15.3 release script의 서버 구조

```text
/srv/blog/releases/<commit-sha>/  불변 코드 release
/srv/blog/current                 현재 release symlink
/srv/blog/shared/secrets/         영속 인증서와 bootstrap token
/srv/blog/shared/backups/         배포 전 runtime 백업
/etc/blog/deploy.env              URL/Cloudflare/보관 개수
/usr/local/sbin/deploy-blog       root 배포 진입점
```

`bootstrap-ec2.sh`는 최초 한 번만 실행한다. 다시 실행하면 bootstrap marker와 token을
다시 배치하고 `/etc/blog/deploy.env`를 기본값으로 덮어쓴다.

## 16. 12단계: Git 저장소 완성 및 push

나머지 설명 문서를 복사한다.

```powershell
Copy-LessonFiles @(
    'README.md',
    'docs/FEATURE_MIGRATION_ROADMAP.md'
)
```

현재 작성 중인 교안은 `$LabRoot\docs\PROJECT_SETUP_AND_DEPLOYMENT_GUIDE.md`로 직접
복사한다.

```powershell
Copy-LessonFiles @('docs/PROJECT_SETUP_AND_DEPLOYMENT_GUIDE.md')
```

완성 파일을 확인한다.

```powershell
Set-Location $LabRoot
git status --short
git add --all
git diff --cached --check
git diff --cached --stat
git commit -m "feat: rebuild secure blog monorepo"
```

새 GitHub repository를 만든 뒤 실제 URL로 바꿔 실행한다.

```powershell
git remote add origin https://github.com/<GITHUB_USER>/<REPOSITORY>.git
git push -u origin main
```

원본 `crusthack/blog`에 실습 결과를 push하지 않는다.

## 17. 13단계: AWS EC2와 Cloudflare 준비

### 17.1 EC2 권장 시작값

- Ubuntu Server 24.04 LTS x86_64
- `t3.small` 이상부터 시작
- 암호화된 gp3 EBS 30 GiB
- 삭제 방지와 Elastic IP
- EC2 key pair `.pem` 안전 보관
- 자동 snapshot 또는 별도 S3 백업 계획

Security Group:

| Port | Source | 이유 |
|---|---|---|
| 80 | Cloudflare IPv4/IPv6 대역 | HTTPS redirect |
| 443 | Cloudflare IPv4/IPv6 대역 | 실제 origin 연결 |
| 3000/8080 | 규칙 없음 | 외부 비공개 |
| 22 | 아래 설명에 따라 선택 | 관리와 현재 CD |

현재 CD는 일반 GitHub-hosted runner가 EC2에 직접 SSH한다. runner IP는 고정되지
않으므로 22를 관리자 IP `/32`만 허용하면 CD가 실패한다.

간단 재현 방식:

- 22를 `0.0.0.0/0`에 열되 key 인증만 사용
- root/password 로그인을 끄고 `.pem`을 production Environment에 제한

권장 강화 방식:

- static IP larger runner, self-hosted runner, VPN 또는 AWS OIDC/SSM 방식으로 CD 재설계

강화 방식은 현재 workflow와 동일하지 않으므로 이 교안은 간단 재현 방식을 사용한다.
22번을 공개하는 경우에는 EC2 접속을 유지한 채 다음 설정을 적용하고, **기존 창을 닫기
전에 새 창에서 key 로그인이 되는지 확인**한다.

```bash
sudo tee /etc/ssh/sshd_config.d/00-blog-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
EOF

sudo sshd -t
sudo systemctl reload ssh
sudo sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|pubkeyauthentication) '
```

출력에서 password와 keyboard-interactive는 `no`, root login은 `no`, public key는
`yes`여야 한다. 이 설정은 SSH가 인터넷에 노출되는 위험을 없애지는 않으므로 EC2
보안 업데이트, key 교체와 접속 로그 점검도 계속 필요하다.

### 17.2 Cloudflare

1. `crusthack.com` A record를 Elastic IP로 설정
2. Proxy 상태를 Proxied로 유지
3. `SSL/TLS → Origin Server`에서 `crusthack.com` Origin CA 발급
4. 인증서와 개인 키를 각각 보관
5. origin 준비가 끝난 후 SSL/TLS mode를 `Full (strict)`로 설정

Origin CA 인증서는 Cloudflare와 origin 사이용이다. 브라우저가 EC2 origin에 직접
접속하면 일반 공개 인증서처럼 신뢰되지 않는 것이 정상이다.

## 18. 14단계: Windows에서 EC2 첫 접속

CMD 또는 PowerShell에서 `.pem` 권한을 제한한다.

```cmd
cd C:\Users\jin\Downloads
takeown /f blogkey.pem
icacls blogkey.pem /inheritance:r
icacls blogkey.pem /grant:r "%USERNAME%:R"
icacls blogkey.pem
```

그 뒤에도 OpenSSH가 `Bad permissions`와 함께 특정 계정 또는 그룹을 표시하면, 오류에
나온 이름을 그대로 사용해 명시적 읽기 권한을 제거한다. 아래 첫 줄은 현재 PC에서 본
예시이므로 다른 PC에서는 따옴표 안을 오류 메시지의 값으로 바꾼다.

```cmd
icacls blogkey.pem /remove:g "DESKTOP-JODL95V\CodexSandboxUsers"
icacls blogkey.pem
```

접속할 때 `@` 앞에 역슬래시를 넣지 않는다.

```cmd
ssh -i blogkey.pem ubuntu@<EC2_ELASTIC_IP>
```

서버 기본 상태를 확인하고 갱신한다.

```bash
cat /etc/os-release
timedatectl
df -h
free -h
sudo apt-get update
sudo apt-get upgrade -y
sudo reboot
```

## 19. 15단계: EC2 최초 bootstrap

### 19.1 최신 소스 준비

재접속 후 Ubuntu에서 실행한다.

```bash
sudo apt-get install -y git openssl
git clone https://github.com/<GITHUB_USER>/<REPOSITORY>.git ~/blog
cd ~/blog
git log -1 --oneline
```

### 19.2 인증서와 Setup Code

```bash
cd ~/blog
install -d -m 700 secrets
nano secrets/cloudflare-origin.pem
nano secrets/cloudflare-origin.key
chmod 644 secrets/cloudflare-origin.pem
chmod 600 secrets/cloudflare-origin.key

chmod +x deploy/scripts/*.sh
deploy/scripts/create-setup-secret.sh
cat secrets/owner-bootstrap-token
```

마지막 출력값은 Owner를 만들 때만 사용하고 비밀번호 관리자에 잠시 보관한다.

사전 검증:

```bash
openssl x509 -in secrets/cloudflare-origin.pem -noout -checkhost crusthack.com
openssl pkey -in secrets/cloudflare-origin.key -noout -check
```

### 19.3 bootstrap 한 번 실행

```bash
cd ~/blog
sudo bash deploy/scripts/bootstrap-ec2.sh

sudo test -x /usr/local/sbin/deploy-blog && echo DEPLOY_COMMAND_OK
sudo test -f /etc/blog/deploy.env && echo DEPLOY_CONFIG_OK
sudo test -d /srv/blog/releases && echo RELEASE_DIRECTORY_OK
sudo systemctl status docker --no-pager
sudo docker run --rm hello-world
```

이 스크립트는 Docker 공식 apt repository를 등록하고 Compose plugin을 설치한 후
`/srv/blog`, 공유 secrets, deploy 설정과 root 소유 명령을 만든다. 별도 배포 사용자는
만들지 않고 Ubuntu AMI의 `ubuntu` 사용자를 사용한다.

## 20. 16단계: GitHub production Environment 5개 값

GitHub repository에서 `Settings → Environments → New environment`로 정확히
`production`을 만든다.

### Secrets 3개

| 이름 | 값 |
|---|---|
| `EC2_HOST` | Cloudflare domain이 아닌 Elastic IP |
| `EC2_SSH_PRIVATE_KEY` | `.pem`의 BEGIN/END 포함 전체 내용 |
| `EC2_SSH_KNOWN_HOSTS` | 실제 EC2 SSH host 공개 키 한 줄 |

### Variables 2개

| 이름 | 값 |
|---|---|
| `EC2_SSH_PORT` | `22` |
| `PRODUCTION_URL` | `https://crusthack.com` |

`EC2_USERNAME`은 필요 없다. workflow가 `ubuntu`로 고정되어 있다.

### Windows `ssh-keyscan` 호환 오류를 피하는 known_hosts 생성

이미 신뢰한 SSH 또는 AWS Instance Connect로 EC2에 접속한 뒤 서버에서 실행한다.

```bash
sudo awk '{print "<EC2_ELASTIC_IP>", $1, $2}' \
  /etc/ssh/ssh_host_ed25519_key.pub
```

예시 형식:

```text
203.0.113.10 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...
```

이 한 줄 전체가 `EC2_SSH_KNOWN_HOSTS`다. `SHA256:...` fingerprint, `#` banner,
사용자 공개 키 또는 개인 `.pem`을 넣지 않는다. `EC2_HOST`와 앞의 host 문자열은
정확히 같아야 한다.

권장 Environment 보호:

- deployment branch는 `main`만 허용
- plan에서 지원하면 required reviewer와 prevent self-review
- `main` branch protection에서 CI와 review 요구

현재 편의형 구성은 GitHub Actions에 `ubuntu` 관리자 key를 맡기므로 해당
Environment에 접근 가능한 사람은 EC2 전체 권한을 얻을 수 있다.

## 21. 17단계: 첫 CD와 Owner 완료

처음 push할 때 아직 bootstrap이 안 되어 있었다면 최초 CD가 다음 오류로 실패할 수
있다.

```text
sudo: '/usr/local/sbin/deploy-blog': command not found
```

bootstrap 완료 후 `Actions → CD → Run workflow`에서 `main`을 실행한다. 과거 실패
job의 재실행도 가능하지만, 배포 archive 관련 코드를 고친 경우에는 반드시 새 commit을
push해야 한다.

성공 확인:

```bash
readlink -f /srv/blog/current
sudo docker compose -f /srv/blog/current/compose.production.yaml \
  -f /srv/blog/current/compose.cloudflare.yaml \
  -f /srv/blog/current/compose.bootstrap.yaml ps

curl --fail --insecure --resolve crusthack.com:443:127.0.0.1 \
  https://crusthack.com/api/health
```

Cloudflare DNS와 `Full (strict)`을 확인한 뒤 브라우저에서
`https://crusthack.com/setup`을 열고 Setup Code로 Owner를 만든다.

초안·공개 글 동작을 확인한 뒤 EC2에서 bootstrap을 종료한다.

```bash
sudo /usr/local/sbin/finish-blog-bootstrap
sudo test ! -e /srv/blog/shared/secrets/owner-bootstrap-token
sudo test ! -e /srv/blog/shared/bootstrap-enabled
```

`finish-blog-bootstrap`은 API가 `requiresSetup:false`라고 응답할 때만 공유 token과
marker를 제거한다. 최초 clone 디렉터리 `~/blog/secrets/owner-bootstrap-token`은
별도 원본이므로 성공 후 직접 제거한다.

```bash
rm -f ~/blog/secrets/owner-bootstrap-token
```

## 22. 운영, 백업과 롤백

### 상태와 로그

```bash
cd /srv/blog/current
sudo docker compose -f compose.production.yaml -f compose.cloudflare.yaml ps
sudo docker compose -f compose.production.yaml -f compose.cloudflare.yaml logs --tail=200
curl --fail https://crusthack.com/api/health
```

### 수동 백업

```bash
cd /srv/blog/current
sudo BACKUP_DIRECTORY=/srv/blog/shared/backups deploy/scripts/backup-runtime.sh
sudo ls -lh /srv/blog/shared/backups
```

백업을 S3 또는 다른 호스트에도 복사한다. EC2 한 대 안의 백업만으로는 instance/EBS
장애를 복구하지 못한다.

### release 확인

```bash
readlink -f /srv/blog/current
sudo find /srv/blog/releases -mindepth 1 -maxdepth 1 -type d -printf '%f\n'
```

배포 스크립트는 기본 5개 release를 유지한다. image build 또는 health check가
실패하면 이전 symlink와 stack을 다시 실행하지만, 이미 적용된 DB migration까지
자동 rollback하지는 않는다.

## 23. 자주 만나는 오류

### `Host key verification failed`

- `EC2_HOST`와 known_hosts 첫 host가 같은지 확인
- IP와 Cloudflare domain을 섞지 않음
- EC2 재생성 후 새 host key로 secret 갱신
- fingerprint가 아니라 `host key-type base64-key` 한 줄 저장

### Windows `ssh-keyscan`의 `unsupported KEX method`

Windows 내장 client와 최신 EC2 OpenSSH의 호환 문제일 수 있다. 20장의 server-side
`awk` 방식으로 known_hosts 값을 만든다.

### `.pem`의 `UNPROTECTED PRIVATE KEY FILE`

18장의 `icacls` 명령으로 상속과 다른 사용자 읽기 권한을 제거한다.

### `deploy-blog: command not found`

서버에서 최신 main을 받고 최초 bootstrap을 실행한다.

```bash
cd ~/blog
git pull origin main
sudo bash deploy/scripts/bootstrap-ec2.sh
```

Owner 초기화를 마친 운영 서버에서는 bootstrap을 재실행하지 말고 명령 파일만
없어진 원인을 먼저 조사한다.

### `release archive unexpectedly contains secrets`

`.gitattributes`에 다음 한 줄이 있고 commit됐는지 확인한다.

```gitattributes
/secrets export-ignore
```

`git archive` 결과를 점검한다.

```bash
git archive --format=tar.gz --output=/tmp/blog-test.tar.gz HEAD
tar -tzf /tmp/blog-test.tar.gz | grep -E '(^|/)secrets(/|$)' && echo BAD || echo OK
```

### 컨테이너 unhealthy

```bash
sudo docker compose -f /srv/blog/current/compose.production.yaml \
  -f /srv/blog/current/compose.cloudflare.yaml ps
sudo docker compose -f /srv/blog/current/compose.production.yaml \
  -f /srv/blog/current/compose.cloudflare.yaml logs --tail=200 backend frontend nginx
```

### Cloudflare 526

- Origin certificate가 `crusthack.com`을 포함하는지 확인
- 인증서와 private key가 한 쌍인지 확인
- 443 Security Group이 Cloudflare 대역에서 열렸는지 확인
- Cloudflare mode가 `Full (strict)`인지 확인

## 24. 현재 구현의 한계와 개선 과제

현재와 동일하게 재현하려면 아래 한계를 임의로 고치지 않는다. 별도 branch에서
개선한다.

- `PostNumber = Max + 1`은 동시 글 생성 경쟁에 취약하며, 가장 큰 번호의 글을 지운 뒤
  그 번호가 재사용될 수 있다.
- 공개 글이 숨김 카테고리에 속해도 상세 API의 직접 URL로 조회된다. 목록 정책과
  상세 정책이 일치하지 않는다.
- Identity의 5회 실패 lockout 옵션은 있지만 현재 Owner의 `LockoutEnabled`가 false라
  계정 잠금이 작동하지 않는다. IP별 로그인 rate limit만 실제 적용된다.
- 제목·카테고리 이름 등의 일부 입력은 길이를 먼저 검사하고 나중에 trim하므로 공백만
  있는 값이 빈 문자열로 저장될 수 있다. 동시 category/post 변경의 DB 충돌도 일부는
  Problem Details가 아니라 500이 될 수 있다.
- 검색은 제목·설명에 대한 SQLite `LIKE`이며 `%`, `_`도 wildcard로 해석된다. 본문
  검색과 페이지네이션은 없다.
- 상태 변경 API는 명시적 antiforgery token을 사용하지 않고 `SameSite=Strict` cookie에
  의존한다. `AllowedHosts`도 현재 `*`다.
- Data Protection key는 Docker volume에 영속화되지만 별도의 application-level key
  encryptor는 없다. 운영에서는 EBS 암호화와 host 접근 통제가 함께 필요하다.
- Frontend의 권한 redirect는 UX용이다. 실제 보안은 Controller의 `[Authorize]`가
  담당한다.
- `SetupGuard`와 글 데이터는 hydration 후 client fetch한다. 초기 HTML의 SEO 정보가
  약하고 setup 상태 조회 실패 시 guard가 본문을 표시하는 fail-open 동작이다.
- 카테고리 update와 글 delete API에 대응하는 UI가 없고, 숨김 여부·순서를 UI에서
  수정할 수도 없다.
- Frontend unit/component/E2E 테스트가 없고 lint/build만 자동 검증한다.
- Markdown code highlight, 목차, 이미지 업로드, MDX는 없으며 CSS는 중복 selector와
  마지막 cascade override에 의존한다. 웹폰트 파일도 포함하지 않아 OS별 결과가 다를
  수 있다.
- 별도 `error.tsx`, `loading.tsx`, custom 404, favicon/public asset과 `.env.example`이
  없다. 날짜는 browser timezone, 읽기 시간은 공백 단어 수/250을 사용하므로 특히
  한국어 글에서 정확하지 않을 수 있다.
- `global.json`과 container base image digest가 고정되지 않았다. lockfile로 JavaScript
  패키지는 고정되지만 SDK와 미래 image bytes까지 완전 재현되지는 않는다.
- `crusthack.com`이 Nginx, preflight, 배포 기본값 등에 들어 있어 domain 변경은 여러
  파일을 함께 수정해야 한다. `PRODUCTION_URL`은 GitHub 배포 화면 URL이지 이 값을
  모두 바꾸는 설정이 아니다.
- 일반 GitHub-hosted runner 직접 SSH는 고정 IP allowlist와 맞지 않는다.
- `ubuntu` 관리자 key를 Actions가 사용하므로 전용 최소 권한 사용자보다 blast radius가
  크다.
- workflow concurrency는 Actions 실행끼리만 직렬화한다. 서버 배포 명령에는 `flock`이
  없어 수동 배포와 Actions 배포를 동시에 실행하면 충돌할 수 있다.
- rollback은 코드와 Compose만 복원하고 DB down migration은 수행하지 않는다.
- runtime backup은 자동 만료되지 않아 별도 보존·외부 복제 정책이 필요하다.
- `bootstrap-ec2.sh`는 재실행용 reconcile script가 아니라 최초 설치 script다.
- Cloudflare IP 목록은 Nginx 파일에 정적으로 들어 있어 공식 목록과 주기적으로 비교해야
  한다.

## 25. 최종 합격 체크리스트

### 저장소

- [ ] root `npm ci`, `dotnet restore` 성공
- [ ] Git 추적 대상에 `secrets`, DB, backup 없음
- [ ] EF pending model change 없음
- [ ] Backend 테스트 8개 성공
- [ ] Frontend lint와 production build 성공
- [ ] `git diff --check` 성공

### 로컬 기능

- [ ] 개발 Owner 로그인
- [ ] 카테고리 생성
- [ ] Markdown 초안 작성·수정
- [ ] 익명 사용자에게 초안 404
- [ ] 공개 게시물과 검색/분류 조회
- [ ] restart 후 데이터 유지
- [ ] runtime backup 생성

### Docker

- [ ] Backend/Frontend/Nginx 모두 healthy
- [ ] host에서 3000/8080 미공개
- [ ] Backend/Frontend non-root 실행
- [ ] 개발 Owner 설정이 Production image에 없음
- [ ] Setup Code와 Origin private key가 Git/image에 없음

### AWS/Cloudflare/CD

- [ ] 암호화 EBS와 Elastic IP
- [ ] Cloudflare Proxied + Full (strict)
- [ ] 80/443 origin 접근 범위 확인
- [ ] 현재 SSH CD 방식에 맞는 22 접근 경로 확인
- [ ] production secrets 3개와 variables 2개
- [ ] CI 성공 commit SHA만 배포
- [ ] `/srv/blog/current`가 해당 SHA를 가리킴
- [ ] 외부 `/api/health` 200
- [ ] Owner 생성 후 bootstrap marker/token 제거
- [ ] 첫 backup을 EC2 외부에도 보관

## 26. 복사 누락 자동 검사

실습 저장소와 교재 저장소의 Git 추적 파일을 비교한다. `package-lock.json` 같은 큰
생성물까지 hash가 같아야 정확 복사 과정이 완료된 것이다.

```powershell
$referenceFiles = @(git -C $ReferenceRoot ls-files)
$labFiles = @(
    git -C $LabRoot ls-files --cached
    git -C $LabRoot ls-files --others --exclude-standard
) | Sort-Object -Unique
$missing = @()
$different = @()
$extra = @($labFiles | Where-Object { $_ -notin $referenceFiles })

foreach ($relativePath in $referenceFiles) {
    $source = Join-Path $ReferenceRoot $relativePath
    $destination = Join-Path $LabRoot $relativePath
    if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) {
        $missing += $relativePath
        continue
    }
    $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
    $destinationHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
    if ($sourceHash -ne $destinationHash) {
        $different += $relativePath
    }
}

"누락: $($missing.Count)"
$missing
"내용 차이: $($different.Count)"
$different
"추가 파일: $($extra.Count)"
$extra
```

교안을 학습하며 의도적으로 메모나 개선 코드를 추가했다면 차이가 나오는 것이
정상이다. 정확 snapshot 확인 시에는 세 값이 모두 0이어야 한다. `node_modules`,
`.next`, `bin`, `obj`, runtime처럼 `.gitignore` 대상인 생성물은 추가 파일에서 제외된다.

## 공식 참고 자료

- [Next.js 문서](https://nextjs.org/docs)
- [ASP.NET Core 문서](https://learn.microsoft.com/aspnet/core/)
- [ASP.NET Core Identity](https://learn.microsoft.com/aspnet/core/security/authentication/identity)
- [EF Core migration](https://learn.microsoft.com/ef/core/managing-schemas/migrations/)
- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Docker Compose](https://docs.docker.com/compose/)
- [GitHub Actions environments](https://docs.github.com/actions/deployment/targeting-different-environments/managing-environments-for-deployment)
- [GitHub-hosted runners](https://docs.github.com/actions/using-github-hosted-runners/about-github-hosted-runners)
- [AWS EC2 Security Group](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html)
- [Cloudflare Origin CA](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)
- [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
