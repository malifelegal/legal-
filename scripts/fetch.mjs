// 수집 오케스트레이터: 법령 공포/시행 + 정부입법예고 데이터를 받아
// docs/data/*.json 으로 기록한다. (GitHub Actions 에서 실행)
//
// 설계 원칙: 일부 소스가 실패해도 사이트가 비지 않도록, 실패 시 기존 파일을
//            유지하고 meta.json 에 오류/안내를 남긴다.
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLaws } from './fetch-laws.mjs';
import { fetchBills } from './fetch-bills.mjs';
import { OC } from './lib/lawgo.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../docs/data');

async function writeJson(name, obj) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(resolve(DATA_DIR, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

async function readJsonOrNull(name) {
  try {
    return JSON.parse(await readFile(resolve(DATA_DIR, name), 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const meta = {
    updatedAt: new Date().toISOString(),
    oc: OC ? `${OC.slice(0, 3)}***` : null,
    sources: {},
  };

  // --- 법령 공포/시행 ---
  try {
    const laws = await fetchLaws();
    await writeJson('laws.json', laws);
    meta.sources.laws = { ok: true, count: laws.length };
    console.log(`[laws] ${laws.length}건 수집`);
  } catch (e) {
    const prev = (await readJsonOrNull('laws.json')) || [];
    await writeJson('laws.json', prev); // 기존 데이터 보존
    meta.sources.laws = { ok: false, count: prev.length, error: e.message };
    console.error(`[laws] 실패: ${e.message} (기존 ${prev.length}건 유지)`);
  }

  // --- 정부입법예고 ---
  try {
    const { enabled, items } = await fetchBills();
    if (enabled) {
      await writeJson('bills.json', items);
      meta.sources.bills = { ok: true, enabled: true, count: items.length };
      console.log(`[bills] ${items.length}건 수집`);
    } else {
      const prev = (await readJsonOrNull('bills.json')) || [];
      await writeJson('bills.json', prev);
      meta.sources.bills = {
        ok: true,
        enabled: false,
        count: prev.length,
        notice: 'DATA_GO_KR_KEY 미설정 — 정부입법예고 serviceKey 발급 후 활성화됩니다.',
      };
      console.log('[bills] serviceKey 미설정 — 건너뜀');
    }
  } catch (e) {
    const prev = (await readJsonOrNull('bills.json')) || [];
    await writeJson('bills.json', prev);
    meta.sources.bills = { ok: false, count: prev.length, error: e.message };
    console.error(`[bills] 실패: ${e.message}`);
  }

  await writeJson('meta.json', meta);
  console.log('[meta]', JSON.stringify(meta.sources));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
