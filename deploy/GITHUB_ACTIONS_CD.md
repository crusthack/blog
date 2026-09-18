# GitHub Actions CD 설정과 운영

`.github/workflows/deploy.yml`은 `main`의 `CI` workflow가 성공하면 해당 커밋을
EC2에 자동 배포한다. `workflow_dispatch`로 수동 실행할 수도 있지만 `main`에서만
허용하며, 수동 실행 시에는 Backend format/test/publish와 EF migration 일치 검사,
Frontend lint/test/build 및 기본 배포 설정 검증을 다시 수행한다.
오래된 CI 실행을 다시 실행해도 현재 `main` HEAD가 아니면 배포를 거부한다.

## 배포 흐름

```text
main push
  → CI: Backend test + Frontend lint/build + Compose/Nginx 검증
  → production Environment 보호 규칙
  → 검증된 commit의 Git tracked files를 tar.gz로 패키징
  → 고정된 SSH host key를 검증하며 /var/tmp에 SCP
  → ubuntu가 sudo로 root 소유 deploy-blog <commit-sha> 실행
  → 서버 배포 잠금 획득(다른 수동/자동 배포와의 충돌 방지)
  → 기존 runtime 백업
  → /srv/blog/releases/<commit-sha> 활성화
  → Docker Compose build/up
  → origin의 Frontend/API health check
  → 실패 시 이전 release symlink 복원
```

서버는 GitHub 저장소 자격증명을 보관하지 않는다. 데이터베이스와 Data Protection
키는 Docker `blog_runtime` volume에, 인증서와 백업은 `/srv/blog/shared`에 남는다.

## 1. SSH host key 고정

관리자 PC에서 EC2 host key fingerprint를 AWS 콘솔의 인스턴스 콘솔 또는 이미
신뢰한 첫 SSH 연결 결과와 대조한다. 확인한 뒤 known_hosts 한 줄을 만든다.

기본 SSH 포트가 22인 경우:

```bash
ssh-keyscan -H <EC2_ELASTIC_IP> > ec2_known_hosts
ssh-keygen -lf ec2_known_hosts
```

다른 포트라면 `ssh-keyscan -p <PORT> -H <HOST>`를 사용한다. 출력 전체가
`EC2_SSH_KNOWN_HOSTS` secret 값이다. workflow 안에서 `ssh-keyscan`을 실행하지
않으므로 배포 시 중간자 공격으로 새 host key를 자동 신뢰하지 않는다.

## 2. GitHub production Environment

GitHub 저장소에서 `Settings → Environments → New environment`를 열고 이름을
정확히 `production`으로 만든다.

권장 보호 설정:

- Deployment branches: `Selected branches and tags`에서 `main`만 허용
- 저장소 플랜이 지원하면 Required reviewers 지정
- 가능하면 Prevent self-review와 관리자 우회 방지 활성화
- `main` branch protection에서 CI 통과와 PR review 요구

Environment secret:

| 이름 | 값 |
|---|---|
| `EC2_HOST` | Elastic IP 또는 고정 DNS 이름 |
| `EC2_SSH_PRIVATE_KEY` | EC2 생성 시 받은 개인 키(`.pem`) 전체 |
| `EC2_SSH_KNOWN_HOSTS` | 검증한 `ssh-keyscan` 출력 전체 |

Environment variable:

| 이름 | 값 |
|---|---|
| `EC2_SSH_PORT` | 보통 `22` |
| `PRODUCTION_URL` | `https://crusthack.com` |

Cloudflare Origin 개인 키, Setup Code, Owner 비밀번호와 DB 파일은 GitHub에
등록하지 않는다. 이 값들은 EC2의 `/srv/blog/shared`에만 존재한다.

## 3. SSH 접속과 sudo 확인

GitHub에 등록하기 전 관리자 PC에서 Actions가 사용할 것과 같은 키로 접속과
비대화형 sudo를 확인한다.

```bash
ssh -i ~/.ssh/ec2-admin.pem ubuntu@<EC2_ELASTIC_IP>
sudo -n /usr/local/sbin/deploy-blog invalid-sha
```

두 번째 명령은 비밀번호를 묻지 않고 `invalid commit SHA`로 실패해야 한다. 다음은
현재 구성에서는 성공한다.

```bash
sudo -n id
```

이는 `ubuntu`가 EC2 관리 계정이기 때문이다. 별도 배포 사용자를 두는 구성보다
간단하지만 Actions SSH 키가 유출되면 인스턴스 전체가 노출될 수 있다. 따라서
`production` Environment의 required reviewer와 `main` 보호 규칙을 권장한다.

## 4. 첫 CD 실행

1. 현재 변경을 review하고 `main`에 merge한다.
2. `Actions → CI`가 성공하는지 확인한다.
3. 자동으로 생성된 `CD` 실행이 production 승인을 기다리면 승인한다.
4. Actions 로그에서 `blog deploy complete`를 확인한다.
5. 외부 health와 주요 기능을 확인한다.

```bash
curl --fail https://crusthack.com/api/health
curl --fail https://crusthack.com/
```

CD가 실행되지 않으면 `Actions → CD → Run workflow`에서 `main`을 선택한다.

## 5. 배포 실패와 롤백

컨테이너 실행 또는 health check 실패 시 배포 스크립트는 `current` symlink를 이전
릴리스로 돌리고 이전 Compose 구성을 다시 실행한다. 실패 로그와 배포 직전 백업은
각각 다음 위치에서 확인한다.

```bash
sudo docker compose -f /srv/blog/current/compose.production.yaml \
  -f /srv/blog/current/compose.cloudflare.yaml logs --tail=200
sudo ls -lh /srv/blog/shared/backups
readlink -f /srv/blog/current
```

DB migration이 이미 적용된 뒤 새 Backend가 실패했다면 코드 rollback만으로 충분하지
않을 수 있다. 이 경우 서비스를 중지하고 배포 직전 runtime 백업을 검토한 뒤 복원한다.
운영 데이터가 생긴 뒤에는 백업 복원을 자동 실행하지 않는다.

수동으로 이전 릴리스를 다시 활성화할 때는 정확한 release 경로를 먼저 확인한다.

```bash
sudo find /srv/blog/releases -mindepth 1 -maxdepth 1 -type d -printf '%f\n'
sudo ln -sfn /srv/blog/releases/<PREVIOUS_SHA> /srv/blog/current
cd /srv/blog/current
sudo docker compose -f compose.production.yaml -f compose.cloudflare.yaml up -d --build
```

## 6. 키 회전

1. 새 ed25519 키 쌍을 만든다.
2. EC2 `ubuntu`의 `authorized_keys`에 새 공개 키를 추가한다.
3. 새 개인 키로 SSH와 수동 CD를 검증한다.
4. GitHub `EC2_SSH_PRIVATE_KEY`를 새 개인 키로 교체한다.
5. 이전 공개 키를 EC2에서 제거하고 이전 개인 키를 폐기한다.

GitHub secrets와 EC2 authorized key를 정기적으로 검토하고 사용하지 않는 키는
제거한다.

## 헬스체크의 최근 업데이트

CD 패키징 시 배포 대상의 전체 commit SHA와 committer 시각을
`apps/backend/release-info.json`에 기록해 릴리스와 함께 배포합니다.
`/api/health`의 `release.commitSha`, `release.updatedAtUtc`와 헬스체크 페이지의
최근 업데이트에 사용하며, 표시 시간대는 Asia/Seoul입니다. 상태 조회 시각
(`checkedAtUtc`) 및 서버 재시작 시각과 구분합니다. 재배포·롤백 시에도 해당 소스
커밋의 식별자와 시각을 유지합니다. 메타데이터가 없는 로컬·수동 빌드는
`배포 정보 없음`으로 표시됩니다.
