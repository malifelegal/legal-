# 법령 모니터 (legal-)

미래에셋생명 법무팀 공통 공간 — **법제처 입법예고·법령 공포/시행 사항**을 한눈에 모아
주요 내용을 보고, 첨부파일(제·개정문·신구조문대비표 등)을 바로 확인·다운로드하는 정적 웹사이트.

## 기능

- 📜 **법령 공포·시행**: 최근 공포된 법령을 공포일 순으로. 법률/시행령/부령 필터, 검색.
- 📝 **정부입법예고**: 제안이유·주요내용(API 원문) 요약과 의견제출 기한, 첨부파일.
- 📂 **첨부파일 원클릭**: 법령 본문 · 신구조문대비표 · 제·개정문을 버튼 하나로 열기(또는 한번에 열기).
- ⭐ **주요 법령**: 법령 탭에서 체크로 고른 항목을 `featured.json` 으로 내보내 팀 공유.
- 🚀 **자동 배포**: `docs/` 가 변경되면 GitHub Actions 가 GitHub Pages 로 배포.

## 구조

```
docs/                       # GitHub Pages 루트 (정적 사이트)
  index.html
  assets/{app.js, styles.css}
  data/{laws,bills,meta}.json   # 수집 결과 (자동 생성)
scripts/                    # 데이터 수집기 (로컬에서 실행 → JSON 커밋)
  fetch.mjs                 # 오케스트레이터
  fetch-laws.mjs            # 법령 공포/시행 (law.go.kr OpenAPI)
  fetch-bills.mjs           # 정부입법예고 (data.go.kr OpenAPI)
  seed.mjs                  # 초기 시드 데이터 생성(1회성)
  lib/lawgo.mjs             # API 클라이언트/유틸
.github/workflows/static.yml        # docs/ 변경 시 + 수동 실행 → Pages 배포
```

> **데이터 갱신 방식**: 법제처 OpenAPI 는 ① 브라우저 직접 호출이 CORS 로 막혀 있고
> ② 등록 IP 에서만 응답하므로 GitHub Actions 러너에서 자동 수집이 불가하다.
> 따라서 데이터는 **로컬(등록 IP)에서 `scripts/fetch.mjs` 로 받아 `docs/data/*.json` 으로 커밋**하고,
> 워크플로우는 `docs/` 를 GitHub Pages 로 **배포만** 한다. 사이트는 같은 출처의 JSON 만 읽어 CORS 문제가 없다.

## 설정

### 1) GitHub Pages 활성화
저장소 **Settings → Pages → Source: GitHub Actions** 로 설정.

### 2) 인증키(Secrets) 등록
**Settings → Secrets and variables → Actions** 에서:

| Secret | 용도 | 발급처 |
| --- | --- | --- |
| `LAW_OC` | 법령 공포/시행 (필수) | [open.law.go.kr OpenAPI 신청](https://open.law.go.kr) — 등록 ID 가 OC 값 |
| `DATA_GO_KR_KEY` | 정부입법예고 (선택, 발급 후) | [data.go.kr · 정부입법예고](https://www.data.go.kr/data/15058407/openapi.do) |

> `LAW_OC` 미등록 시 `scripts/lib/lawgo.mjs` 의 기본 OC 를 사용한다.
> `DATA_GO_KR_KEY` 미등록 시 입법예고 탭은 발급 안내만 표시되고, 키 등록 후 자동 활성화된다.

### 3) 배포
- 자동: `docs/` 변경을 `main` 에 push 하면 GitHub Actions 가 Pages 로 배포.
- 수동: **Actions → Deploy static content to Pages → Run workflow**.

> 데이터 갱신은 로컬에서 `scripts/fetch.mjs` 실행 후 `docs/data/*.json` 을 커밋하는 방식(아래 참고).

## 로컬 미리보기

```bash
cd docs && python3 -m http.server 8000   # http://localhost:8000
```

데이터 직접 수집(인증키 필요):

```bash
cd scripts
LAW_OC=발급받은OC node fetch.mjs            # docs/data/*.json 갱신
```

## 데이터 출처

- 법령 본문·공포/시행: [국가법령정보센터](https://www.law.go.kr) (법제처 OpenAPI)
- 정부입법예고: [정부입법지원센터](https://www.lawmaking.go.kr) (공공데이터포털)

> 본 사이트는 법무팀 내부 참고용입니다. 법적 효력 판단은 반드시 원문을 확인하세요.
