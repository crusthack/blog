# GitHub Pages 정적 블로그

`blog` 저장소에서 기존 Next.js/ASP.NET 운영 블로그와 별도로 읽기 전용 정적 블로그를 배포한다.
`blog-legacy`의 카테고리 탐색·Markdown 빌드·Pages 배포 구조를 참고하되,
현재 글의 원본은 운영 SQLite이므로 레거시 `posts/` 폴더 대신 운영 서버의 공개 API를 사용한다.
레거시 MDX를 실행하거나 콘텐츠를 자동으로 가져오지는 않는다.

## 운영 연결

1. Cloudflare DNS에서 app.crusthack.com을 기존 EC2로 연결하고 Origin 인증서가 이 호스트를 포함하는지 확인한다. 새 Nginx 설정을 먼저 배포하고 https://app.crusthack.com/login 과 /api/health 를 확인한다.
2. GitHub 저장소 Settings → Pages에서 GitHub Actions를 선택한다. 소스 URL 기본값은 https://app.crusthack.com 이다. 첫 수동 실행으로 github.io/blog에서 글과 첨부, 로그인·관리 링크를 확인한다.
3. Pages의 custom domain을 crusthack.com으로 설정하고 도메인 검증, apex DNS의 Pages 연결, HTTPS 적용을 완료한다. 운영 로그인은 app.crusthack.com에서 다시 한다. 기존 /login, /admin 등 AWS 북마크에는 app 서브도메인을 사용한다.
4. EC2에 Python 3.9 이상과 시스템 시간대 데이터가 필요하다. 아래 명령으로 SQLite 볼륨의 실제 경로를 확인한다.

```bash
docker volume inspect blog_blog_runtime --format '{{.Mountpoint}}'
```

EC2에 root만 읽을 수 있는 /etc/blog/pages.env 파일을 생성한다. BLOG_DB는 위 경로 아래 blog.db, PAGES_URL은 실제 Pages 주소(전환 후 https://crusthack.com), PAGES_DISPATCH_TOKEN은 crusthack/blog에만 Actions 쓰기 권한을 부여한 fine-grained token이다. 저장소에 이 파일을 커밋하지 않는다.

```bash
sudo install -m 0644 /srv/blog/current/deploy/blog-pages.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now blog-pages
sudo journalctl -u blog-pages -n 30
```

AWS 서비스는 매일 한국 시간 01:00 이후 첫 확인에서 로컬 SQLite 공개 데이터와 생성기 버전을 마지막 배포 manifest와 비교한다. 중단 뒤 당일 재기동하면 누락된 확인을 수행한다. 5초 간격으로 SQLite 변경을 감시해 배포된 공개 글·첨부가 삭제되거나 비공개·숨김 처리되면 다음 예약 시각을 기다리지 않고 GitHub Actions를 호출한다. 실제 제거는 Pages 배포 완료 시점이다. 실패 시 기존 배포를 유지하고 다시 요청한다. 배포 결과는 1분 간격으로 확인한다. 토큰 교체나 서비스 코드 업데이트 후 systemctl restart blog-pages 를 실행한다.

Actions는 공개 API로 두 번 조회해 수집 중 변경을 감지하고, 완성한 HTML·첨부 파일을 Pages artifact로 배포한다. 서버에서 생성물을 Git에 커밋하지 않는다.

## 포함 범위

- 홈·소개: 웹에서 저장한 값이 우선이며, 저장값이 없으면 `apps/frontend/content/*.md`를 사용한다.
- 전체 공개 글과 카테고리별 목록, 하위 카테고리 탐색, 글별 수정 날짜.
- Markdown/GFM 본문, 기존 본문과 같은 제목 ID·정적 목차, 이미지, 다운로드 첨부, 사이트맵과 404 페이지.
- 레거시의 문서형 배치를 참고한 카테고리 사이드바, 행형 목록, 반응형·다크 모드.
- 글 주소는 `/posts/{categorySlug}/{postNumber}/` 형식을 유지한다.
- 비공개·코드 보호 글 및 숨긴 카테고리의 글은 본문·제목·첨부 모두 내보내지 않는다.
- 로그인·작성·댓글·북마크·서버 필기·관리 기능은 운영 블로그에서 이용한다.

본문의 알려진 글·카테고리·홈·소개 링크와 등록 첨부 URL은 Pages 내부 주소로 바꾼다.
그 외 운영 전용 경로는 운영 사이트로 연결한다. 외부 이미지는 원래 URL을 유지한다.
HTML/MDX 스크립트는 실행하지 않는다. 관리자 클라우드·댓글·개인 필기는 수집하지 않는다.

**Pages는 배포 시점의 공개 사본이다.** 운영 사이트에서 비공개로 바꾸거나 삭제해도
삭제 감지로 시작된 Pages 배포가 성공할 때까지 이전 사본이 남는다. 필요한 경우 수동으로
워크플로를 실행하고 결과를 확인한다. 이미 다운로드된 사본이나 외부 캐시는 회수할 수 없다.
정적 사본은 실시간 접근 제어가 필요한 콘텐츠의 배포처로 사용하지 않는다.

## 로컬 검증

Node.js 24 이상에서 저장소 루트 기준:

```powershell
npm ci
npm run test:pages
$env:PAGES_SOURCE_URL = 'https://crusthack.com'
$env:PAGES_URL = 'https://crusthack.github.io/blog'
$env:PAGES_FORCE = 'true'
npm run build:pages
```

생성 결과는 Git에서 제외되는 `out/pages/`다. 출력 디렉터리에 이전 파일이 있으면
빌드가 실패한다. 이전 결과를 다른 곳으로 옮기거나 삭제하고 다시 실행해야 삭제된 글이나
첨부가 새 artifact에 남지 않는다. 로컬 환경 변수는 해당 PowerShell 세션에만 적용된다.

`PAGES_FORCE=true`는 이전 manifest 비교만 생략하고 공개 범위·수집 일관성 검증은 유지한다.
출력 디렉터리의 내용을 Pages 사이트 루트로 제공하는 정적 HTTP 서버로 미리 볼 수 있다.
`/blog` 경로를 검증할 때는 해당 디렉터리를 서버의 `/blog/`에 마운트한다.

요청은 약 650ms 간격으로 실행하여 기존 API의 IP당 제한 아래로 유지한다.
글별 본문과 첨부 목록을 두 번 읽으므로 글 수에 비례해 시간이 증가한다.
공유 IP의 추가 트래픽이나 대규모 콘텐츠 때문에 요청 제한·55분 job 제한에 도달하면
그 실행은 실패한다. 첨부 합계가 900 MiB를 초과하면 Pages 크기 한도를 고려해 중단한다.

테스트는 공개 범위, 수집 중 변경, 페이지 나누기 일관성, 삭제 반영, 첨부 복사·무결성,
해시 비교, 루트·프로젝트 경로, Markdown 안전 렌더링과 API 오류 처리를 검증한다.


## 운영 화면과 배포 요청

Pages는 운영 프런트의 SiteHeader, SiteFooter, BlogFrame, PostList, SitePageDocument, PostView를 공유한다.
공개 데이터는 빌드 시 익명 API로 수집한다. 글 하단에서 댓글 보기를 누르면 운영 API를 조회하며, 회원 작업은 운영 도메인에서 진행한다.
사이트 관리 → 전체 현황 → Pages 즉시 배포는 Owner 전용이다. EC2의 /etc/blog/deploy.env에
`export PAGES_DISPATCH_TOKEN=...`을 설정한 뒤 backend 컨테이너를 다시 생성한다. 토큰은 crusthack/blog에 대한 Actions 쓰기 권한이 필요하다.
버튼은 main의 pages.yml을 force로 실행하고, 배포 기록 링크에서 결과를 확인한다.
