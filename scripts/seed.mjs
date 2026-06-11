// 초기 시드 데이터 생성기 (1회성). 라이브 API 접근이 막힌 환경에서
// 사이트가 비지 않도록, MCP로 확인한 실제 법령 메타데이터로 docs/data/laws.json 을 만든다.
// 운영에서는 GitHub Actions 의 fetch.mjs 가 이 파일을 최신 데이터로 대체한다.
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lawLinks, fmtDate } from './lib/lawgo.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../docs/data');

// MCP(law.go.kr) 로 확인한 실제 법령 메타데이터
const rows = [
  { lsId: '011468', mst: '286175', name: '개인정보 보호법 시행령', lawType: '대통령령', ministry: '개인정보보호위원회', anc: '20260519', ef: '20260519' },
  { lsId: '003654', mst: '285553', name: '보험업법 시행령', lawType: '대통령령', ministry: '금융위원회', anc: '20260421', ef: '20260421' },
  { lsId: '003058', mst: '270551', name: '근로기준법 시행령', lawType: '대통령령', ministry: '고용노동부', anc: '20250408', ef: '20251023' },
  { lsId: '011357', mst: '270351', name: '개인정보 보호법', lawType: '법률', ministry: '개인정보보호위원회', anc: '20250401', ef: '20251002' },
  { lsId: '001872', mst: '265959', name: '근로기준법', lawType: '법률', ministry: '고용노동부', anc: '20241022', ef: '20251023' },
  { lsId: '001532', mst: '265389', name: '보험업법', lawType: '법률', ministry: '금융위원회', anc: '20240920', ef: '20250131' },
];

const items = rows.map((r) => {
  const links = lawLinks({ lsId: r.lsId, mst: r.mst, name: r.name });
  return {
    id: r.lsId,
    mst: r.mst,
    name: r.name,
    abbr: null,
    lawType: r.lawType,
    revisionType: null,
    ministry: r.ministry,
    promulgationDate: fmtDate(r.anc),
    promulgationNo: null,
    enforcementDate: fmtDate(r.ef),
    links,
    attachments: [
      { label: '법령 본문', kind: 'law', url: links.fullText, direct: false },
      { label: '신구조문대비표', kind: 'oldnew', url: links.oldNew, direct: false },
      { label: '제·개정문 / 이유', kind: 'reason', url: links.reason, direct: false },
    ],
  };
});

await mkdir(DATA_DIR, { recursive: true });
await writeFile(resolve(DATA_DIR, 'laws.json'), JSON.stringify(items, null, 2) + '\n');
await writeFile(resolve(DATA_DIR, 'bills.json'), JSON.stringify([], null, 2) + '\n');
await writeFile(
  resolve(DATA_DIR, 'meta.json'),
  JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      seed: true,
      oc: 'tjf***',
      sources: {
        laws: { ok: true, count: items.length, note: '초기 시드(MCP 확인 데이터)' },
        bills: {
          ok: true,
          enabled: false,
          count: 0,
          notice: 'DATA_GO_KR_KEY 미설정 — 정부입법예고 serviceKey 발급 후 활성화됩니다.',
        },
      },
    },
    null,
    2
  ) + '\n'
);

console.log(`시드 생성 완료: laws ${items.length}건`);
