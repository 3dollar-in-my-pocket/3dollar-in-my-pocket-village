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

## 로컬 실행

```bash
npm install
npm run db:migrate:local
npm run dev            # http://localhost:8787
```

- 로컬은 `DEV_AUTH=1`이라 토큰 없이 열면 **개발용 입장** 폼이 뜹니다 (`/dev-login?name=이름`)
- 여러 유저 테스트: `localhost:8787`, `127.0.0.1:8787`, `<맥 IP>:8787`은 쿠키가 따로라 각각 다른 유저
- 대기열 테스트: `npx wrangler dev --var VILLAGE_CAPACITY:2`
- 실제 앱 토큰 테스트: `curl -H "Authorization: <dev 토큰>" -i http://localhost:8787/` → `Set-Cookie: bv_session=...`
- 데이터 초기화: `npm run reset:local`
- 랭킹 대시보드: `/dashboard` (입장 인원에 포함되지 않음)

## 배포 (production)

```bash
npx wrangler login
npx wrangler d1 create boong-village          # 출력된 database_id를 wrangler.jsonc env.production에 넣기
npm run db:migrate:prod
npx wrangler secret put SESSION_SECRET --env production   # 긴 랜덤 문자열
npm run deploy                                 # https://boong-village.3dollarinmypocket.workers.dev
```

production 변수는 `wrangler.jsonc`의 `env.production.vars`에 있습니다. `THREEDOLLARS_API`는 운영 API, `DEV_AUTH`는 `0`, `VILLAGE_CAPACITY`는 `50`입니다.

## 로그인 모드 (`AUTH_MODE`)

| 값 | 동작 |
|---|---|
| `guest` (지금) | 가슴속 3천원 로그인 없이 "입장하기"만 누르면 기기별 게스트 ID(30일 쿠키)로 입장. `INVITE_CODE` 시크릿을 넣으면 입장 코드가 필요해짐 |
| `app` | 앱 웹뷰의 `Authorization` 토큰으로만 입장 (아래 앱 연동) |

입장 코드 설정: `npx wrangler secret put INVITE_CODE --env production` (지우면 코드 없이 입장)

## 앱 연동 (iOS 예시)

웹뷰 첫 요청에만 헤더를 붙이면 됩니다. 이후 통신은 세션 쿠키로 인증합니다.

```swift
var request = URLRequest(url: URL(string: "https://boong-village.3dollarinmypocket.workers.dev/")!)
request.setValue(Preference.shared.authToken, forHTTPHeaderField: "Authorization")
webView.load(request)
```

- 세션 쿠키는 12시간 유효합니다. 만료되면 "앱에서 다시 열어 주세요" 화면이 뜹니다
- 토큰 검증용 API 호출 설정(`THREEDOLLARS_UA`)은 레포에 두지 않고 Cloudflare 시크릿으로 관리합니다: `npx wrangler secret put THREEDOLLARS_UA --env production` (로컬은 `.dev.vars`)

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

## 남은 일

- 판매·주문 원장(감사 로그) 테이블: 무료 플랜 쓰기 한도 때문에 지금은 누적값만 저장
- 닉네임·메시지 욕설 필터, 신고
- 네트워크가 잠깐 끊겼을 때 자리 유지(재접속 유예 시간)
- 시즌 초기화(자본 리셋) 관리 기능
