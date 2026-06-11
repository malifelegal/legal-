// 법령 공포/시행 사항 수집 — 최근 공포된 법령 목록을 받아 정규화한다.
// 출처: 국가법령정보 공동활용 OpenAPI (target=law, sort=ddes → 공포일 내림차순)
import { drf, asArray, fmtDate, lawLinks } from './lib/lawgo.mjs';

const DISPLAY = Number(process.env.LAWS_DISPLAY || 100);

/** DRF 1개 항목 -> 사이트용 정규화 객체 */
function normalize(row) {
  const lsId = String(row.법령ID || '').trim();
  const mst = String(row.법령일련번호 || '').trim();
  const name = String(row.법령명한글 || '').trim();
  const links = lawLinks({ lsId, mst, name });

  return {
    id: lsId,
    mst,
    name,
    abbr: String(row.법령약칭명 || '').trim() || null,
    lawType: String(row.법령구분명 || '').trim() || null,
    revisionType: String(row.제개정구분명 || '').trim() || null,
    ministry: String(row.소관부처명 || '').trim() || null,
    promulgationDate: fmtDate(row.공포일자),
    promulgationNo: String(row.공포번호 || '').trim() || null,
    enforcementDate: fmtDate(row.시행일자),
    links,
    // 첨부/바로보기: law.go.kr 공식 뷰어 딥링크. 뷰어 페이지에서 HWP/PDF 다운로드.
    attachments: [
      { label: '법령 본문', kind: 'law', url: links.fullText, direct: false },
      { label: '신구조문대비표', kind: 'oldnew', url: links.oldNew, direct: false },
      { label: '제·개정문 / 이유', kind: 'reason', url: links.reason, direct: false },
    ],
  };
}

export async function fetchLaws() {
  const json = await drf('lawSearch', {
    target: 'law',
    sort: 'ddes', // 공포일자 내림차순 = 최근 공포 순
    display: DISPLAY,
    page: 1,
  });

  const rows = asArray(json?.LawSearch?.law);
  const items = rows
    .map(normalize)
    .filter((x) => x.id && x.name)
    // 공포일 최신순 정렬 (API가 보장하지만 한 번 더 안정화)
    .sort((a, b) =>
      String(b.promulgationDate || '').localeCompare(String(a.promulgationDate || ''))
    );

  return items;
}

// 단독 실행 지원
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchLaws()
    .then((items) => console.log(JSON.stringify(items, null, 2)))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
