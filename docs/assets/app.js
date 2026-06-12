// 법령 모니터 프론트엔드 — 정적 JSON(data/*.json)을 읽어 렌더링한다.
// 모든 데이터는 빌드/수집 시점에 docs/data 로 생성되므로 CORS 문제가 없다.

const state = {
  tab: 'laws',
  query: '',
  filter: null, // {key, value}
  ministry: null, // 선택된 소관부처(대표부처) — null이면 전체
  groupByMinistry: true, // 부처별 그룹 표시 on/off
  laws: [],
  bills: [],
  billsEnabled: false,
};

const $ = (sel) => document.querySelector(sel);

async function loadJSON(path, fallback) {
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    return fallback;
  }
}

function fmtDate(d) {
  if (!d) return '—';
  return d; // 이미 YYYY-MM-DD
}

function isFuture(d) {
  if (!d) return false;
  return new Date(d) > new Date();
}

function lawTypeClass(t) {
  if (!t) return '';
  if (t.includes('법률')) return 'law';
  if (t.includes('대통령령')) return 'decree';
  if (t.includes('총리령') || t.includes('부령') || t.includes('규칙')) return 'rule';
  return '';
}

// 소관부처명이 "국방부,병무청"처럼 묶인 경우 대표(첫 번째) 부처만 추출
function primaryMinistry(m) {
  if (!m) return '기타';
  return String(m).split(',')[0].trim() || '기타';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

/* ---------- 첨부파일 버튼 ---------- */
function attachmentsHTML(atts) {
  if (!atts || !atts.length) return '';
  const urls = atts.map((a) => a.url);
  const btns = atts
    .ma
