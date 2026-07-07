# 센터(Senter) — 프로젝트 규약

리빙 SNS 초보 운영자(재아 님)를 위한 AI 마케팅 멘토 웹앱. 사용자는 **코딩을 전혀 모름** — 모든 결정은 "비개발자가 GitHub Pages 링크 하나로 쓸 수 있는가"를 기준으로.

## 철칙 (어기면 안 됨)

1. **무의존성 정적 앱**: 빌드 도구·프레임워크·npm 금지. 순수 HTML/CSS/JS. 외부 라이브러리가 꼭 필요하면 `vendor/`에 파일로 내장 (현재: pdf.js, jszip).
2. **렌더링을 막는 외부 리소스 금지**: 외부 CSS/폰트는 반드시 비차단 로드(`media="print" onload`). *교훈: 구글 폰트가 head를 막아 흰 화면 사고 발생.*
3. **한국어 UI, 초보자 눈높이**: 전문 용어는 즉시 쉬운 말로 풀기. 에러 메시지는 "무엇을 하면 되는지"까지 안내.
4. **localStorage가 유일한 DB**: 접두사 `senter:`. 모든 쓰기는 `store.set()` 경유(용량 초과 시 토스트). 대용량 목록은 반드시 cap (채팅 80, 팀채팅 60, 활동 30, 회의록 10).
5. **AI 3단계 안전망**: `aiChat()` = ① 사용자 API 키(Anthropic 직접 호출) → ② 무료 AI(Puter.js) → ③ 실패 시 오프라인 템플릿 + "지시서 복사" 수동 흐름. **AI가 없어도 앱이 죽지 않아야 함.**
6. **3D CSS 변환 금지**: 아이소메트릭 rotateX/Z는 환경에 따라 납작하게 뭉개짐(실제 사고). 사무실은 평면 탑다운 도트게임 스타일 유지.
7. **`window.prompt()` 금지**: 긴 텍스트 입력은 전용 모달(`#doc-modal` 패턴) 사용.

## 파일 구조

| 파일 | 역할 |
|---|---|
| `index.html` | 전체 마크업 (탭 10개: 사무실·AI직원·멘토챗·홈·생산성·릴스·트렌드·스튜디오·자료실·설정) |
| `app.js` | 전체 로직 (~5200줄, 섹션 주석으로 구분) |
| `style.css` | 디자인 (오트밀/세이지 팔레트, `:root` 변수) |
| `studio.html` | 크리에이터 스튜디오 (독립 앱, iframe으로 내장, 자체 localStorage 키). 로드 시 `senter:studioInbox`를 소비해 승인된 이모티콘 기획을 프로젝트로 자동 등록 |
| `sw.js` | 서비스 워커 (오프라인 캐시, https에서만 등록 — file://은 자동 스킵) |
| `vendor/` | pdf.min.js + worker, jszip.min.js |
| `claude-desk/` | 별도 로컬 Node 도구 (웹 배포와 무관, 건드리지 말 것) |
| `trend-viewer/` | 별도 로컬 트렌드 관제판 (Python 3 stdlib, 포트 8779, 웹 배포와 무관) |
| `docs/` | ARCHITECTURE.md(상세 설계), PROMPT-TEMPLATE.md(재사용 프롬프트) |

## 디자인 토큰 (오트밀/세이지)

`--bg:#f7f6f3 --surface:#fff --text:#262522 --accent:#2e7d5b --accent-strong:#1f5c42 --accent-soft:#e3f0e9 --line:#e5e2d9` (studio.html은 자체 토큰: oat #EFEEE7, sage #5E7C64). 사무실 픽셀 파트만 예외적으로 진한 외곽선(#14161f)과 하드 섀도 사용.

## 테스트 방법

Playwright(playwright-core + `/opt/pw-browsers/chromium`)로 headless 스모크 테스트. 패턴: `file:///.../index.html` 열기 → 온보딩 통과(`#ob-done`, `#kg-later`) → 기능 실행 → localStorage/DOM 검증. **테스트 훅**: `window.__senter = { chatterTick, holdScrum, rebuildStaff, taskBrief, verifyBrief, focusComplete, recordUsage, renderTokenBar, estTokens, ensureUsage, autoPilotTick, templateDraft }` (자율 근무 테스트는 `autoPilotTick(true)`로 강제 틱). 주의: 탭 전환 후 요소를 조작할 것(스크롤 이슈), 움직이는 캐릭터 대신 책상(`.f-desk[title=이름]`) 클릭, 재정렬되는 목록은 텍스트 필터로 지정.

## 핵심 데이터 흐름

지시 입력 → `createTask()`(키워드 라우팅, @이름 지명) → `dispatchWork()` = API 키 있으면 `autoWork()`(AI 파이프라인), 없으면 `templateWork()`(오프라인 초안 엔진) → 3단계(초안 draft → 교차검증 verify → 최종검토 final) → 검토 대기 review → 승인 done. 보완 요청은 카드 안 폼(철칙 7)이며 **draft/result를 비워야** 재작업이 처음부터 실행됨(`templateWork`는 draft가 있으면 검증부터 이어감 — 새로고침 복구용). 새로고침 복구는 `resumePendingFinals()`가 저장된 `autoWorking`/`finalizing` 플래그를 지운 뒤 재개. 직원 채용은 `customStaff` + `rebuildStaff()`가 책상·좌석·라우팅 전부 자동 재생성. 사무실 연출(말풍선·회의)은 항상 **실제 데이터 기반** — 지어낸 대사 금지.

**자율 근무(오토파일럿)**: `autoPilotTick()`(60초 주기, `settings.autoPilot` 기본 ON)이 ① 새 자료 → 자동 스터디 회의(silent, 탭 안 뺏음) ② 열린 업무 <2 & 검토 <4일 때 INITIATIVES 풀에서 다음 업무 자동 착수 ③ 3일 내 일정 준비 태스크 ④ 3일마다 자동 보고서. 상태는 `senter:autoState`. `templateDraft()`가 AI 없이 닉네임/릴스 대본/캡션 등 실제 초안을 생성하며 자료실 발췌(`docSnippets`)를 인용.

## 남은 할 일

`docs/ARCHITECTURE.md`의 "남은 할 일" 섹션 참고.
