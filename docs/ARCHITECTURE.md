# 센터(Senter) 아키텍처 & 설계 결정 기록

> 이 문서는 세션(대화)이 끝나도 남는 설계 기록입니다. 다음 작업자(사람이든 AI든)는 이 문서와 `CLAUDE.md`, `docs/PROMPT-TEMPLATE.md`를 먼저 읽으세요.

## 1. 한 줄 요약

코딩을 모르는 리빙 SNS 초보 운영자가 **GitHub Pages 링크 하나**로 쓰는 AI 마케팅 멘토/가상 오피스. 서버 없음, 빌드 없음, 결제 없이도 작동.

## 2. 시스템 구성

```
index.html ─ 탭 10개 SPA (사무실 / AI직원 / 멘토챗 / 홈 / 생산성 / 릴스 / 트렌드 / 스튜디오 / 자료실 / 설정)
app.js     ─ 모든 로직. 섹션: 저장소 → 멘토 페르소나 → AI직원(지시서+스킬) → 커스텀직원 → 로드맵
             → AI호출(aiChat 체인) → 사무실(렌더/회의/보고서/스터디) → 업무보드(파이프라인)
             → 자율 근무 → 채팅 → 자료실(PDF) → 생산성 → 릴스 대본 → 트렌드 → 설정/백업
style.css  ─ 오트밀/세이지 토큰 + 사무실 픽셀 스타일
studio.html─ 크리에이터 스튜디오(허브/패턴/이모티콘/템플릿분할). 독립 스코프, iframe 내장
```

## 3. localStorage 데이터 모델

| 키 | 내용 | 상한 |
|---|---|---|
| `senter:settings` | 프로필·apiKey·model(팀장·과장용)·staffModel(팀원용, 기본 하이쿠)·workMode | - |
| **IndexedDB** `senter-db`→kv→"docs" | 자료실 [{id,title,content,enabled}] — **localStorage 5MB 한계 우회(기가바이트급)**. 시작 시 `initDocsStore()`가 메모리 로드 + 레거시 `senter:docs` 자동 이전, 쓰기는 `saveDocs()` (IDB 실패 시 localStorage 폴백) | PDF 추출 100만 자/건 |
| **IndexedDB** kv→tasks·meetings·chats·teamChat·activity | 큰 기록 전부 — `initBigStore()`가 이전(성공 후 localStorage 삭제), 이후 `store.set()`이 자동으로 IDB 라우팅. **재개(resumePendingFinals)·renderAll은 이전 완료 후 실행** (localStorage가 비어 보이는 창 방지). 전체 초기화 시 `senter-db` 삭제 필수 | 회의록 100 · 팀채팅 500 · 활동 300 · 채팅 400/멘토 · 완료 업무 200 |
| `senter:chats` | 멘토별 대화 {personaId:[...]} | 페르소나당 80개 |
| `senter:tasks` | 업무 [{id,title,assignee,status,stage,draft,critique,result,note}] | - |
| `senter:customStaff` | 채용 직원 [{id,name,role,duty,emoji,keywords,look}] | 총 직원 11명 (기본 8: 이모티콘 기획자 포함) |
| `senter:teamChat` / `senter:activity` / `senter:meetings` | 대화/활동/회의록 | 60 / 30 / 10 |
| `senter:todos` `events` `notes` `focusLog` | 생산성 | - |
| `senter:roadmapDone` `missions` `stageOpen` `currentPersona` `personaBarExpanded` | UI 상태 | - |
| `senter:autoState` | 자율 근무 상태 (done/studied/preparedEvents/lastReportAt) | - |
| `senter:trendKeywords` | 트렌드 탭 관심 키워드 | - |
| `senter:studioInbox` | 센터→스튜디오 핸드오프 큐 (스튜디오 로드 시 소비 후 삭제) | - |
| `studio_hq_v1` `emoticon_studio_v1` `pattern_studio_v1` `studio_shell_last` | 스튜디오(iframe) 자체 키 | - |

백업: 설정 탭 내보내기/불러오기 (senter:* 전체, API 키 제외. 스튜디오 키는 스튜디오 자체 내보내기 사용).

## 4. 주요 설계 결정과 이유 (시행착오 포함)

| 결정 | 이유 / 교훈 |
|---|---|
| 정적 SPA + localStorage | 사용자가 비개발자. 서버·DB·배포 파이프라인은 유지 불가능. 트레이드오프: 기기 간 동기화 없음(백업 파일로 대체) |
| 자율 근무 `autoPilotTick()` | 사용자가 자료만 올리면 스터디 회의→초안→보고까지 자동. AI 없으면 `templateDraft()` 오프라인 초안 엔진이 실제 결과물 생성 |
| 직원 스킬 시스템 | 오픈소스 PM 방법론(phuryn/pm-skills, garrytan/gstack, coreyhaines31/marketingskills — 모두 MIT)을 SKILLS 레지스트리로 이식. STAFF_SKILLS로 직원별 장착 → staffPrompt()가 지시서·자동작업·검증패널에 주입. 스킬 초안 4종(페르소나/포지셔닝/북극성/회고) + 자율 체인(bench→personas→positioning→northstar) + 완료 8건마다 gstack Retro. trend-viewer(파이썬 서버)는 정적 앱에 이식 불가로 제외 |
| 트렌드 웹 탭 | 정적 앱의 CORS 제약을 공개 프록시 체인(직접→allorigins→corsproxy)으로 우회해 구글 트렌드 급상승·구글뉴스 키워드 RSS를 브라우저에서 직접 표시. 10분 캐시, 전 경로 실패 시 안내+로컬 관제판 유도. ➕ 버튼이 `📈 트렌드 수집 (날짜)` 문서에 누적(중복 방지) → 오토파일럿이 자동 스터디. 외부 프록시는 무료 서비스라 다운 가능성 있음 — 3중 폴백+로컬 도구가 안전망 |
| 리서치 자동화 | 벤치마킹 보고서(`benchDraft`)·카카오 이모티콘 시장 분석(`emoticonKakaoDraft`)·멀티 플랫폼 기획(`emoticonMultiDraft`)을 자율 이니셔티브로 생성. 실시간 크롤링은 불가하므로 검증된 패턴 지식 + "10분 직접 확인 체크리스트" + AI 연결 시 심화 분석의 3층 구조. 7일마다 주간 벤치마킹 갱신 |
| AI 3단계 체인 `aiChat()` | 사용자가 API 결제 실패(카드 문제). ① Anthropic(브라우저 직접, `anthropic-dangerous-direct-browser-access`) → ② Puter.js 무료(키 불필요, 첫 사용 시 무료계정 팝업 1회) → ③ 오프라인 템플릿(미션=로드맵 기반, 우선순위=마감순, 보고서·회의=데이터 조립) + "지시서 복사→무료 챗봇" 수동 흐름 |
| 자동 실행은 **버튼**으로 (키 없을 때) | Puter 첫 인증 팝업은 사용자 제스처 필요 + 예상 못 한 백그라운드 호출 방지 |
| 업무 파이프라인 = 회사 결재선 | draft(팀원 초안, **하위 모델로 토큰 절약**)→verify(팀장 검토·수정+팀 회의 — 지적·수정을 1회 호출로 통합)→final(과장 전체 회의·최종 보고서)→review(사장 승인). `TEAMS` 3팀: 콘텐츠(planner장)·성장(analyst장)·지식창작(digest장), 팀장 담당 업무는 과장이 검토. 총 AI 3회 호출(기존 4회에서 절감 + 초안은 하이쿠). `workMode:"quick"`으로 1단계 모드 전환 가능 |
| 보고서 PDF는 브라우저 인쇄로 | pdf 생성 라이브러리 대신 숨김 iframe에 인쇄용 HTML을 만들어 `print()` — 인쇄 대화상자의 "PDF로 저장"이 곧 다운로드. 무의존성 유지, file://·https 모두 동작 |
| 사무실 = 평면 탑다운 픽셀 | **아이소메트릭 3D CSS(rotateX+역회전)는 환경에 따라 납작하게 렌더되는 사고 발생** → 전면 폐기. 도트게임 스타일이 안정적이고 사용자도 선호 |
| 채용 시스템 완전 데이터 주도 | `rebuildStaff()`가 STAFF·책상 그리드·회의 좌석 타원(seatRing)·키워드 라우팅을 전부 재생성. 하드코딩 좌표 금지 |
| studio.html은 iframe 격리 | 2,800줄 독립 앱을 인라인 병합하면 CSS/JS 충돌. iframe이면 충돌 0. **교훈: 구글 폰트 CSS가 렌더링 차단 → `media="print" onload` 비차단 로드 필수** |
| PDF는 pdf.js 내장(v3 legacy) | v4는 ESM 전용이라 file://에서 실패. v3 legacy는 file://·https 모두 동작 확인 |
| `window.prompt()` 제거 | 한 줄 입력창에 전자책 붙여넣기 불가능(실사용 차단 버그). 전용 모달로 교체 |
| 회의는 순차 say() + 중복 소집 가드 | 회의 중 다른 회의 소집 시 조용한 무시 → 토스트 안내 + 버튼 비활성화로 개선 |
| 파이프라인 새로고침 복구 | `templateWork`는 draft가 있으면 검증 단계부터 이어감 + `resumePendingFinals()`가 로드 시 끊긴 doing 업무를 재개. **교훈 2가지: ① `autoWorking` 플래그가 localStorage에 같이 저장되므로 로드 시 반드시 초기화(안 하면 재개 필터에 걸려 영영 멈춤) ② 보완 요청 시 draft/result를 비워야 함(안 비우면 이어가기 로직이 옛 초안을 그대로 재제출)** |
| renderBoard 폼 상태 보존 | 인라인 폼(보완요청·초안 제출)은 카드 DOM에 상태가 있는데 파이프라인이 3~4초마다 renderBoard()로 보드를 통째 재생성 → **타이핑 중 텍스트가 날아가는 회귀 발생(8관점 리뷰에서 발견)**. renderBoard 시작 시 열린 폼의 값·포커스를 task id로 스냅샷하고 재생성 후 복원 |
| 스튜디오 핸드오프는 지연 소비 | 승인 즉시 iframe을 재로딩하면 스튜디오의 세션 전용 작업물(업로드 이미지)이 예고 없이 파괴됨 → 승인 시엔 인박스에 쓰기만 하고, 스튜디오 탭 진입 시(renderStudio) 인박스가 남아 있을 때만 재로딩. 인박스 소비는 저장 성공 후에만 removeItem (실패 시 다음 방문에 재시도) |
| SW는 핵심 파일 network-first | 파일별 stale-while-revalidate는 '구 HTML + 신 JS' 캐시 조합(흰 화면)을 만들 수 있음 → HTML/JS/CSS는 network-first(오프라인만 캐시 폴백), vendor·아이콘만 cache-first. 새 DOM 요소 바인딩은 `?.addEventListener`로 방어. 배포 시 sw.js의 CACHE 버전을 올리면 전체 세트가 원자적으로 교체됨 |

## 5. 엣지 케이스 방어 현황 (프리런치 점검 완료)

- **localStorage 초과**: senter `store.set` 토스트 / 스튜디오 허브·이모티콘 save()가 경고 배너+토스트, 성공 시 배너 해제(영구 포기 안 함) / 설정 탭에 사용량 미터(5MB 기준 80% 경고) / 채팅 80개 cap
- **ZIP 내보내기**: JSZip 미로드 → 낱장 순차 저장 폴백 / `generateAsync` 실패도 try-catch로 동일 폴백 / `toBlob` null 가드
- **아이패드/사파리**: `-webkit-backdrop-filter` 접두사, `rotate:` 단독 속성 → `transform: rotate()`로 통일, 클립보드 실패 시 execCommand 폴백, 사파리 시크릿 모드(setItem throw)는 스튜디오 memoryOnly 프로브가 감지
- **네트워크 없음**: 폰트 비차단, Puter 15초 타임아웃+`freeAiBroken` 캐시로 반복 대기 방지, 모든 AI 기능에 오프라인 대체 경로

## 6. 테스트 플레이북

```bash
node --check app.js                    # 문법
# Playwright 스모크 (scratchpad의 smoke*.mjs 패턴)
# 필수 통과 항목: 온보딩 → 지시→배정→파이프라인(초안/검증/최종/승인) → 채용/해고 자동반영
#   → 스크럼(일정 언급) → 스터디 회의(자료 자동 활성화) → 보고서(자료실 저장)
#   → 생산성 4종 → PDF 업로드(http+file) → 스튜디오 iframe(.snbtn 4개) → 새로고침 지속성
```
함정: 탭 전환 직후 조작(스크롤 리셋 있음), 움직이는 캐릭터 대신 책상 클릭, 정렬되는 목록은 `filter({hasText})`, 회의 종료는 마지막 대사 +4초 대기.

## 7. 남은 할 일 (다음 후보)

1. **클라우드 동기화** — 기기 간 이동은 백업 파일. 무료로는 어려워 보류 중
2. **스토어 출시 준비** — PWA(매니페스트+서비스 워커)까지 완료. 네이티브 앱스토어 출시 시 TWA(안드로이드)/캡슐화(iOS) 검토

### 로컬 도구 (웹 배포와 별개, Node 필요)
- `trend-viewer/` — 급상승·유튜브·쇼츠·릴스·X·스레드·틱톡·AI뉴스 로컬 트렌드 관제판 (Python 3 stdlib only, 포트 8779).
  sdr-glitch/trend-viewer 포크에서 병합 (원 저장소가 개발 본거지 — devlog/_upstream은 그쪽에만).
  단위테스트 91개 내장(`python3 -m unittest discover -s src -p 'test_*.py'`), 더블클릭 런처는 병합 시 추가.
  ※ 초기 Node 간이 버전은 이 병합으로 대체·삭제됨 (git 히스토리 5dac53f에 보존)
- `claude-desk/` — 팀용 Claude Code 웹 데스크 (기존)

### 완료됨 (기록)
- ~~전문가 검토 반영(기획·마케팅)~~ → ① 조직-자율업무 정합성: 수익화·제휴부(mediaKit 미디어킷·단가표)·내부 교육부(guide 업무 가이드) INITIATIVES 추가 ② 마케팅 루프 닫기: 콘텐츠 승인 시 `schedulePublishTodo()`가 "발행→성과 기록" 할 일(D+2) 자동 생성 ③ templateDraft 분기 순서 주의 — **제목의 부가 단어("협찬 제안 대비")가 앞 분기에 걸릴 수 있어 구체적 분기를 앞에 배치**
- ~~부서별 사무공간 + 일반 직원~~ → 조직: 대표→과장(pm)→3개 부서(콘텐츠 마케팅부·성장 전략부·지식·창작부) 팀장→팀원. 일반 직원 3명(콘텐츠 에디터·리서치 어시스턴트·교육 도우미) 추가, 팀장 직속. `TEAMS`에 `room` 좌표 → `rebuildStaff`가 각 직원 책상을 소속 부서 방에 자동 배치, `ROOMS`가 부서 방+과장실 렌더. **교훈: TEAMS를 rebuildStaff보다 먼저 정의(TDZ), @지명은 두 단어 이름 지원(글자수 소비 방식)**
- ~~완료 보고서 4단 구조~~ → `buildDeliverable()`이 회의안건→회의록(결재선 순)→결과물→기획안+대표 결정요청으로 조립 (templateWork·autoWork 공통)
- ~~자율근무 루프~~ → 초안 소진돼도 멈추지 않게: 같은 자료 반복 심화 스터디(3회 cap)+최적화 개선 라운드(vN 순환). 사무실 탭 순서: 사무실→현황판→지시→팀채팅
- ~~아이디어 던지기~~ → 홈 최상단 카드: 아이디어 입력 → `ideaToTask()`(키워드 라우팅) → 기획 회의 연출 → `ideaPlanDraft()` 기획 보고서(각도 3안·릴스 대본·캡션·체크리스트) → 검토 대기 → [📄 보고서 보기]. Enter 제출, [코치와 대화]는 기존 변환기 흐름
- ~~기록 용량 확장~~ → BIG_KEYS(tasks·meetings·chats·teamChat·activity)를 IndexedDB로 이전, cap 대폭 상향. **교훈: ① `store.set` 라우팅 방식이라 호출부 무수정 ② 테스트가 localStorage를 직접 읽으면 전부 깨짐 → 훅(getTasks 등) 제공 ③ 전체 초기화에 IDB 삭제 누락 버그 발견·수정(연결 close 후 deleteDatabase)**
- ~~파스텔 그린 전환~~ → 오로라 토큰만 민트·세이지 계열로 교체 (구조는 CSS 변수라 색만 갈아끼움)
- ~~오로라 리디자인~~ → 사용자 제공 목업 반영: 라벤더·핑크 파스텔 글래스 테마(기본) + 오트밀 클래식 토글(`body[data-theme]` + CSS 변수 스왑), 홈 대시보드(인사말·통계 3카드·최근 활동), 모바일 하단 네비(4탭+더보기 시트, 상단 탭 숨김), 업무 카드 진행률 바(단계 33/66/90%). **교훈: 하단 고정 요소끼리 겹침 주의 — 토큰 바가 하단 네비 클릭을 가로챘음(z-index+bottom 오프셋으로 해결)**
- ~~저장공간 한계~~ → 자료실을 IndexedDB로 이전 (마이그레이션 자동, `navigator.storage.persist()` 요청, 설정 미터에 전체 한도 표시, PDF 캡 30만→100만 자). **주의: 테스트에서 docs는 `window.__senter.getDocs()`로 읽을 것**
- ~~스크럼 회의 AI 대사~~ → API 키 연결 시 `aiScrumLines()`가 실제 보드 데이터를 근거로 자유 발언 생성(12초 타임아웃, "이름|대사" 파싱), 실패·미연결 시 기존 템플릿 대사 폴백. 회의록에 "🤖 AI 자유 발언 모드" 표기
- ~~스튜디오 자산 ↔ 업무 연결~~ → 이모티콘 기획 승인 시 `senter:studioInbox` → 스튜디오 로드 시 소비(프로젝트명·제출 현황·본부 아이디어 뱅크 자동 등록, 제목 기준 중복 방지). iframe 재로딩은 `frame.src = frame.src` (contentWindow.reload는 file://에서 크로스오리진 차단)
- ~~트렌드 한글 브리핑~~ → [🇰🇷 한글 브리핑] 버튼: AI가 급상승·뉴스를 쉬운 한국어 + 주제별 콘텐츠 아이디어로 요약, AI 불가 시 기본판 템플릿 폴백(철칙 5), 자료실 저장 버튼
- ~~해시태그 리빙 고정~~ → `hashtagSet()`: 주제 파생 태그 + (리빙 계열일 때만) 리빙 전용 태그
- ~~오프라인/설치형 수준~~ → `sw.js` 서비스 워커 (stale-while-revalidate, https에서만 등록)
- ~~회의록 열람 UI~~ → 사무실 탭 [📜 회의록] 보관함 (최근 10개, 펼쳐보기)
- ~~스튜디오 ↔ 센터 데이터 연결~~ → `readStudioSns()` → 보고서 "SNS 채널 현황" 표 + 스크럼 채널 멘트
- ~~업무 보드 필터/검색~~ → 보드 상단 검색(제목·담당명), 완료 업무 40개 자동 정리(trimDoneTasks)
- ~~모바일 사무실 터치 최적화~~ → 720px 이하에서 CSS zoom 팬 모드(최소 0.62배 + 좌우 스크롤) + 터치 히트 영역 확장. **교훈: transform scale은 레이아웃 크기를 안 줄여 스크롤 폭이 틀어짐 → CSS zoom 사용**
- ~~iOS 홈화면 PWA~~ → manifest.json + icon-180/192/512.png + apple-touch 메타 (GitHub Pages https에서 설치 가능)
- ~~로드맵 커스터마이즈~~ → `buildRoadmap()`이 주제 단어를 주입, 설정 변경 시 재생성 (체크 상태 키 유지)
- ~~Puter 모델 고정 옵션~~ → 설정 "무료 AI 모델 지정"(선택), 모델명 오류 시 기본 모델 자동 재시도
