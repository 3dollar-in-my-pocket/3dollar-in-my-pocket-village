# 가슴속 3천원 붕어빌리지

가슴속 3천원 앱 웹뷰에서 여는 멀티플레이 붕어빵 장사 게임입니다.
Cloudflare Workers + Durable Objects(실시간 마을) + D1(유저·게임 데이터)로 돌아갑니다.

## 구조

```
앱 WebView ──(Authorization: <앱 토큰>)──▶ Worker  GET /
                                              │ 토큰을 3천원 API(/api/v4/my/user)로 검증
                                              │ → app_users 저장 → 서명된 세션 쿠키 발급
                                              ▼
            ──(WebSocket /ws, 쿠키)──────▶ Worker ─▶ Village Durable Object (마을 1개)
                                                        · 동시 입장 50명, 초과 시 대기열(자동 입장)
                                                        · 10분 무활동 + 대기자가 있으면 자리 양보
                                                        · 판매·주문·자본은 서버가 계산
                                                        · 굽는 판 상태는 그 가게를 보는 손님에게만 전송
                                                        ▼
                                                     D1: app_users(로그인 정보), players(닉네임·게임 데이터)
```

| 파일 | 역할 |
|---|---|
| `src/worker.js` | 라우팅, 앱 토큰 검증 → 세션 쿠키, WebSocket을 마을 DO로 전달 |
| `src/auth.js` | 3천원 API 토큰 검증, HMAC 세션 서명/검증 |
| `src/village.js` | 마을 DO: 입장 제한·대기열, 게임 규칙, 30초마다 D1 저장 |
| `migrations/` | D1 스키마 |
| `public/` | 게임 클라이언트(정적 파일) |

## 환경

| 환경 | 주소 | 3천원 API | NPC | D1 |
|---|---|---|---|---|
| local | http://localhost:8787 (`npm run dev`) | dev | 있음 | 로컬 |
| dev | https://boong-village-dev.3dollarinmypocket.workers.dev | dev | 있음 | `boong-village-dev` |
| production | https://boong-village.3dollarinmypocket.workers.dev | 운영 | 없음 | `boong-village` |

```bash
npm install
npm run db:migrate:local && npm run dev     # 로컬
npm run db:migrate:dev && npm run deploy:dev   # dev 배포
npm run db:migrate:prod && npm run deploy:prod # production 배포
```

- 로컬은 토큰 없이 열면 **개발용 입장** 폼이 뜹니다 (`/dev-login?name=이름`, 로컬 전용)
- 여러 유저 테스트: `localhost`, `127.0.0.1`, `team.localhost`는 쿠키가 따로라 각각 다른 유저
- 대기열 테스트: `npx wrangler dev --var VILLAGE_CAPACITY:2`
- 시크릿(환경마다 설정, 레포에 없음): `SESSION_SECRET`, `THREEDOLLARS_UA`(로컬은 `.dev.vars`), 선택 `INVITE_CODE`
  ```bash
  npx wrangler secret put SESSION_SECRET --env dev   # 또는 --env production
  ```

## 로그인 모드 (`AUTH_MODE`)

| 값 | 동작 |
|---|---|
| `hybrid` (dev·production 현재값) | 토큰이 없으면 게스트(기기별 30일 쿠키), 앱이 `Authorization` 토큰을 넘기면 3천원 계정으로 로그인. **앱 업데이트 전후 재배포 없이 그대로 동작** |
| `guest` | 토큰을 무시하고 게스트만 |
| `app` | 토큰이 있어야만 입장 |

- 계정 연동: 3천원 `userId` ↔ 게임 플레이어 키를 `accounts` 테이블에 저장합니다. 플레이어 키는 무작위 값이라 랭킹 등에 3천원 내부 ID가 노출되지 않습니다
- 게스트로 플레이하던 기기에서 처음 토큰이 들어오면 **그 게스트 캐릭터·자본을 계정으로 이어받습니다** (`linked_from_guest = 1`). 이미 다른 계정에 연결된 게스트는 이어받지 않습니다
- 잘못되거나 만료된 토큰은 무시하고 게스트로 진행합니다
- 입장 코드: `npx wrangler secret put INVITE_CODE --env production` (지우면 코드 없이 입장)

## 남용 방지

- 게스트 생성: IP당 10분에 30회
- WebSocket 연결: IP당 1분에 60회
- 게임 메시지: 연결마다 초당 15개(순간 40개), 4KB 초과 메시지는 연결 종료
- `/ws`, `/guest-login`은 같은 출처(Origin)에서 온 요청만 받음

## 앱 연동 (iOS 예시)

앱 업데이트 전에는 기존 인앱 브라우저 딥링크로 게스트 모드로 열 수 있습니다.
```
dollars://browser?url=https://boong-village.3dollarinmypocket.workers.dev/&title=붕어빌리지
```

앱 업데이트에서는 인앱 브라우저가 **게임 도메인일 때만** 첫 요청에 토큰을 붙입니다. 이후 통신은 세션 쿠키로 인증합니다.

```swift
// Debug 앱 → dev 환경, Release 앱 → production 환경
private let tokenAllowedHosts: Set<String> = [
    "boong-village-dev.3dollarinmypocket.workers.dev",
    "boong-village.3dollarinmypocket.workers.dev",
]

var request = URLRequest(url: url)
if let host = url.host, tokenAllowedHosts.contains(host) {
    request.setValue(Preference.shared.authToken, forHTTPHeaderField: "Authorization")
}
webView.load(request)
```

- 인앱 브라우저는 약관·외부 링크 등에도 쓰이므로 도메인 제한 없이 토큰을 붙이면 외부 사이트로 토큰이 유출됩니다
- 세션 쿠키는 30일 유효하며, 게임을 열 때마다 토큰을 붙이면 매번 갱신됩니다

## Cloudflare 무료 플랜 기준 예상 사용량 (동시 50명)

| 항목 | 무료 한도 (일) | 이 게임 |
|---|---|---|
| Workers 요청 | 100,000 | 입장·재연결 1회당 2건. 정적 파일은 Worker를 거치지 않음 |
| DO 요청 | 100,000 | 들어오는 WebSocket 메시지 20개 = 1건. 굽는 판 동기화(장사 중 초당 최대 2개)가 대부분 |
| DO 실행 시간 | 13,000 GB-s | 접속자가 있는 동안만 깨어 있음. 하루 24시간 내내 켜져 있어도 약 10,800 GB-s |
| D1 쓰기 | 100,000 행 | 변경된 유저만 30초마다 저장. 50명이 24시간 내내 활동해도 약 72,000 |
| D1 저장 | 5 GB | 유저 1명당 수백 바이트 |

무료 한도를 넘으면 과금되지 않고 해당 기능이 UTC 0시(한국 오전 9시)까지 실패합니다.
이벤트 기간에는 Workers Paid($5/월~)로 올려 두는 걸 권장합니다.

## 일별 방문자 보기 (Cloudflare 대시보드)

Cloudflare 대시보드 → **Storage & databases → D1 → boong-village → Console**에서 실행:

```sql
SELECT * FROM daily_visitors;
```

| 컬럼 | 뜻 |
|---|---|
| `day` | 날짜 (한국 시간) |
| `visitors` | 그날 마을에 입장한 사람 수 (중복 제외) |
| `new_visitors` / `returning_visitors` | 그날 처음 온 사람 / 다시 온 사람 |
| `peak_concurrent` | 그날 최대 동시 접속자 |

대기열에만 있다가 입장하지 못한 사람은 세지 않습니다. 기록은 2026-11-06 배포부터 쌓입니다.

## 방문 그래프 (Cloudflare Web Analytics)

Cloudflare 대시보드 → **Analytics & logs → Web analytics → boong-village.3dollarinmypocket.workers.dev**에서 일별 방문·페이지뷰·기기·국가를 그래프로 봅니다.
비콘은 운영 주소에서만 로드됩니다(로컬 개발은 집계 안 함). 광고 차단기 사용자는 빠지고 같은 사람의 재방문도 각각 세므로, 정확한 사람 수는 위 D1 `daily_visitors`를 기준으로 봅니다.

## 에셋과 라이선스

- `public/assets/Pretendard-*.otf`: Pretendard, SIL Open Font License 1.1 — [LICENSES/Pretendard-OFL.txt](LICENSES/Pretendard-OFL.txt)
- 로고·캐릭터·카테고리 아이콘 등 가슴속 3천원 브랜드 에셋은 가슴속 3천원에 저작권이 있으며 이 레포 밖에서의 사용을 허락하지 않습니다

## 남은 일

- NPC 판매 금액을 서버가 판정하도록 변경 (지금은 클라이언트가 신고 → 랭킹 조작 가능)
- 판매·주문 원장(감사 로그) 테이블: 무료 플랜 쓰기 한도 때문에 지금은 누적값만 저장
- 닉네임·메시지 욕설 필터, 신고
- 네트워크가 잠깐 끊겼을 때 자리 유지(재접속 유예 시간)
- 시즌 초기화(자본 리셋) 관리 기능
