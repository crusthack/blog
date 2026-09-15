# 기능 이식 로드맵

`blog`를 유일한 기준 저장소로 유지하면서 `blog-Frontend`, `blog-Backend`,
`blog-private`의 검증된 기능과 콘텐츠를 단계적으로 옮긴다.

## 유지할 기준

- 최초 Owner는 일회용 Setup Code로만 생성한다.
- 인증은 ASP.NET Core Identity의 HttpOnly 세션 쿠키를 유지한다.
- 운영 설정과 인증 자료는 환경 변수와 Docker Secret으로만 전달한다.
- Frontend와 Backend는 같은 origin의 `/api/*`로 통신한다.
- 각 기능은 DB migration, API 통합 테스트, frontend lint와 production build를 함께 통과해야 한다.
- `blog-private`의 MDX와 이미지는 원본을 보존하고 명시적인 import 과정으로만 이동한다.

## 완료

### 1단계: 콘텐츠 탐색 기반

- 카테고리 모델과 migration
- Owner용 카테고리 생성·수정·삭제 API
- 글과 카테고리 연결
- 공개 카테고리 목록과 글 수
- 카테고리별 글 필터와 제목·설명 검색
- 카테고리 관리 화면과 편집기 선택 항목
- 반응형 archive UI, 소개 페이지, footer
- Markdown 편집 도구와 읽기 시간

### 2단계: 이미지와 첨부 파일

- 글별 JPG/PNG/PDF 저장소
- 확장자, 실제 파일 형식, 크기와 파일명 검증
- Owner용 업로드·이름 변경·삭제 API
- 편집기 첨부 관리자와 Markdown 경로 삽입
- 이미지 재인코딩과 PDF 응답 격리
- Next.js 개발 프록시와 운영 Nginx 업로드 한도 정합성
- runtime volume 백업 범위에 첨부 파일 포함

### 관리·운영 보강

- 카테고리 수정·숨김·정렬 화면
- 숨긴 카테고리 글과 첨부 파일의 공개 직접 접근 차단
- 글 삭제 화면과 연결된 첨부 파일 정리
- DB 기반 외부 사이트 메뉴 설정
- API·SQLite 상태 확인 화면
- 공개 읽기와 첨부 파일 요청 rate limit, SQLite WAL·busy timeout

### 보호 글

- 공개 / 비공개 / 코드로 열람 범위와 목록·검색·첨부 접근 제어
- 글별 접근 코드 해시 저장, 기존 코드는 수정 화면에서 유지 또는 교체
- 글·코드 버전·12시간 만료에 연결된 HttpOnly 열람 쿠키
- 코드 변경과 공개 범위 변경 시 기존 권한 무효화
- IP별 코드 입력 제한과 별도 코드 입력 화면

## 다음 순서

### 3단계: 콘텐츠 이전

- `blog-private/posts` frontmatter parser
- 폴더 경로를 카테고리로 변환하는 dry-run import
- 기존 글을 덮어쓰지 않는 idempotent import
- `public/images` 참조 수집과 첨부 파일 이동
- import 결과 보고서와 원본 대비 검증

### 5단계: 슬라이드

- 제목 슬라이드와 수동 슬라이드 구문
- 전체 화면·인쇄 레이아웃
- 브라우저 IndexedDB의 개인 메모와 드로잉
- Owner가 명시적으로 Save할 때만 서버 공유 작업 공간 저장

### 6단계: 운영 고도화

- release 단위 자동 롤백
- DB 및 첨부 파일 복원 리허설
- 외부 HTTPS smoke test
- 관리자 화면과 모바일 편집기의 브라우저 회귀 테스트

## 의도적으로 바로 옮기지 않는 항목

- 기존 JWT/refresh-token 인증: 현재 세션 쿠키 구조와 중복되므로 그대로 이식하지 않는다.
- 공개 회원가입과 다중 역할: 개인 Owner 블로그라는 현재 제품 범위가 바뀔 때 별도로 설계한다.
- JavaScript/Python playground: same-origin 코드 실행 위험 때문에 허용 목록 기반 격리 설계 전에는 복원하지 않는다.
- 자동 저장과 글 revision: 현재의 명시적 Save 및 최신 상태 한 건 저장 정책을 유지한다.
