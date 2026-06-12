// 국가법령정보 공동활용 OpenAPI (law.go.kr DRF) 및 공통 유틸.
// 브라우저에서는 CORS로 직접 호출이 불가하므로, 이 모듈은 빌드/수집 시점
// (GitHub Actions 러너)에서만 실행된다.

// OC 인증키: open.law.go.kr 에 등록한 사용자 ID.
// 반드시 환경변수 LAW_OC 로 주입한다(소스에 키를 하드코딩하지 않는다).
// law.go.kr OpenAPI 는 등록 IP 에서만 응답하므로 등록 IP(로컬)에서 실행할 것.
export const OC = process.env.LAW_OC || '';

const DRF_BASE = 'https://www.law.go.kr/DRF';

/** YYYYMMDD -> YYYY-MM-DD (빈 값/이상값은 원본 반환) */
export function fmtDate(yyyymmdd) {
  const s = String(yyyymmdd || '').trim();
  if (!/^\d{8}$/.test(s)) return s || null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** 객체/배열/단일값을 항상 배열로 정규화 (DRF는 1건이면 객체, 여러건이면 배열) */
export function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * DRF JSON 호출. target/유형에 따라 lawSearch(목록) 또는 lawService(본문).
 * 타임아웃(20초) + 최대 3회 재시도 포함.
 * @param {'lawSearch'|'lawService'} kind
 * @param {Record<string,string|number>} params
 */
export async function drf(kind, params) {
  if (!OC) {
    throw new Error(
      'LAW_OC 환경변수가 설정되지 않았습니다. open.law.go.kr 에 등록한 OC(사용자 ID)를 ' +
        'LAW_OC 로 주입한 뒤 등록 IP 에서 실행하세요. (예: LAW_OC=발급받은OC node fetch.mjs)'
    );
  }
  const qs = new URLSearchParams({ OC, type: 'JSON', ...params });
  const url = `${DRF_BASE}/${kind}.do?${qs.toString()}`;

  const MAX_RETRY = 3;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
        },
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        throw new Error(`DRF ${kind} HTTP ${res.status} :: ${url}`);
      }

      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(
          `DRF ${kind} JSON 파싱 실패 (인증키 OC=${OC} 확인 필요). 응답 일부: ${text.slice(0, 200)}`
        );
      }
    } catch (e) {
      lastErr = e;
      console.error(`[drf] 시도 ${attempt}/${MAX_RETRY} 실패: ${e.name} ${e.message}`);
      if (attempt < MAX_RETRY) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw new Error(`DRF ${kind} 최종 실패 :: ${lastErr?.name} ${lastErr?.message} :: ${url}`);
}

/** 법령 공개 뷰어 딥링크 모음 (lsId=법령ID, mst=법령일련번호, name=법령명) */
export function lawLinks({ lsId, mst, name }) {
  const enc = encodeURIComponent(name || '');
  return {
    // 법령 본문 (가장 안정적인 딥링크)
    fullText: `https://www.law.go.kr/법령/${enc}`,
    // 신구조문대비표 (제·개정 전후 비교) — 페이지에서 HWP/PDF 다운로드 가능
    oldNew: `https://www.law.go.kr/LSW/lsInfoP.do?lsId=${lsId}&lsiSeq=${mst}&chrClsCd=010202&viewCls=lsOldAndNew&urlMode=lsOldAndNew`,
    // 제·개정문 / 제·개정이유
    reason: `https://www.law.go.kr/LSW/lsInfoP.do?lsId=${lsId}&lsiSeq=${mst}&chrClsCd=010202&viewCls=lsRvsDoc&urlMode=lsRvsDoc`,
    // 법령 정보 화면 (조문/부칙/별표 탭 포함)
    detail: `https://www.law.go.kr/LSW/lsInfoP.do?lsId=${lsId}&lsiSeq=${mst}&efYd=&chrClsCd=010202`,
  };
}
