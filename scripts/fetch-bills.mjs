// 정부입법예고 수집 — 공공데이터포털(data.go.kr) 법제처 정부입법예고 API.
//   목록 API: 15058407 (법제처_정부입법예고)
//   상세 API: 15090734 (법제처_입법예고 상세 조회) — 제안이유/주요내용/첨부파일 제공
//
// 주의: serviceKey(DATA_GO_KR_KEY)가 발급되어야 동작한다. 키가 없으면
//       enabled:false 로 빈 목록을 돌려주고, 사이트는 "키 발급 후 활성화" 안내를 노출한다.
//
// 엔드포인트/필드명은 data.go.kr 신청 후 발급되는 명세에 맞춰 환경변수로 조정 가능.
import { asArray, fmtDate } from './lib/lawgo.mjs';

const KEY = process.env.DATA_GO_KR_KEY || '';
// 발급받은 명세에 따라 엔드포인트를 덮어쓸 수 있게 환경변수로 분리.
const LIST_URL =
  process.env.DATA_GO_KR_BILLS_LIST_URL ||
  'https://apis.data.go.kr/1170000/lawAdvanceNotice/lawSearchList.do';
const DISPLAY = Number(process.env.BILLS_DISPLAY || 60);

/** 여러 후보 키 중 처음으로 값이 있는 것을 반환 */
function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function normalize(row) {
  const id = pick(row, '입법예고일련번호', 'lawmkSeq', 'id', 'seq');
  const detailUrl =
    pick(row, '입법예고상세링크', '입법예고링크', 'detailLink', 'link') || null;

  // 첨부파일: lawmaking.go.kr 파일 다운로드 링크는 직접 다운로드(direct=true)가 가능.
  const attachments = asArray(row.첨부파일 || row.files || row.fileList)
    .map((f) => {
      const url = pick(f, 'fileUrl', '파일링크', 'downloadUrl', 'url');
      const label = pick(f, 'fileName', '파일명', 'name') || '첨부파일';
      return url ? { label, kind: 'file', url, direct: true } : null;
    })
    .filter(Boolean);

  return {
    id,
    title: pick(row, '입법예고명', '법령명', 'title', 'name'),
    ministry: pick(row, '소관부처명', '부처명', 'ministry'),
    noticeDate: fmtDate(pick(row, '공고일자', '입법예고일', 'noticeDate')),
    opinionStart: fmtDate(pick(row, '의견제출시작일', 'opinionStartDate')),
    opinionDeadline: fmtDate(pick(row, '의견제출마감일', '의견제출종료일', 'opinionEndDate')),
    // 요약은 API 원문(제안이유/주요내용)을 그대로 사용.
    reason: pick(row, '제안이유', 'reason'),
    mainContent: pick(row, '주요내용', 'mainContent', 'content'),
    detailUrl,
    attachments,
  };
}

export async function fetchBills() {
  if (!KEY) {
    return { enabled: false, items: [] };
  }

  const qs = new URLSearchParams({
    serviceKey: KEY,
    type: 'json',
    numOfRows: String(DISPLAY),
    pageNo: '1',
  });
  const res = await fetch(`${LIST_URL}?${qs.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`정부입법예고 API HTTP ${res.status}`);

  const json = await res.json();
  // 공공데이터포털 표준 응답 구조의 여러 형태를 모두 허용.
  const rows = asArray(
    json?.response?.body?.items?.item ??
      json?.body?.items?.item ??
      json?.items ??
      json?.lawSearch?.law
  );

  const items = rows
    .map(normalize)
    .filter((x) => x.title)
    .sort((a, b) =>
      String(b.noticeDate || '').localeCompare(String(a.noticeDate || ''))
    );

  return { enabled: true, items };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchBills()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
