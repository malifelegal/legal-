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
    .map((a) => {
      const icon = a.direct ? '⬇' : '🔗';
      const cls = a.direct ? 'att direct' : 'att';
      const title = a.direct ? '파일 직접 다운로드' : '국가법령정보센터에서 보기/다운로드';
      return `<a class="${cls}" href="${esc(a.url)}" target="_blank" rel="noopener" title="${title}">${icon} ${esc(
        a.label
      )}</a>`;
    })
    .join('');
  const allBtn =
    atts.length > 1
      ? `<button class="att att-all" data-open='${esc(JSON.stringify(urls))}'>📂 첨부 한번에 열기</button>`
      : '';
  return `<div class="attachments">${btns}${allBtn}</div>`;
}

/* ---------- 카드 렌더 ---------- */
function lawCard(x) {
  const cls = lawTypeClass(x.lawType);
  const future = isFuture(x.enforcementDate);
  return `<article class="card">
    <div class="card-head"><h2>${esc(x.name)}${
    x.abbr ? ` <span class="abbr">(${esc(x.abbr)})</span>` : ''
  }</h2></div>
    <div class="badges">
      ${x.lawType ? `<span class="badge ${cls}">${esc(x.lawType)}</span>` : ''}
      ${x.revisionType ? `<span class="badge rev">${esc(x.revisionType)}</span>` : ''}
      ${x.ministry ? `<span class="badge ministry">${esc(x.ministry)}</span>` : ''}
    </div>
    <div class="dates">
      <span>📢 공포 <b>${fmtDate(x.promulgationDate)}</b>${
    x.promulgationNo ? ` (제${esc(x.promulgationNo)}호)` : ''
  }</span>
      <span class="${future ? 'future' : ''}">🗓 시행 <b>${fmtDate(x.enforcementDate)}</b>${
    future ? ' (예정)' : ''
  }</span>
    </div>
    ${
      x.summary
        ? `<div class="summary"><span class="label">주요 내용</span>${esc(x.summary)}</div>`
        : ''
    }
    ${attachmentsHTML(x.attachments)}
  </article>`;
}

function billCard(x) {
  return `<article class="card">
    <div class="card-head"><h2>${esc(x.title)}</h2></div>
    <div class="badges">
      <span class="badge rule">입법예고</span>
      ${x.ministry ? `<span class="badge ministry">${esc(x.ministry)}</span>` : ''}
    </div>
    <div class="dates">
      ${x.noticeDate ? `<span>📢 공고 <b>${fmtDate(x.noticeDate)}</b></span>` : ''}
      ${
        x.opinionDeadline
          ? `<span>✍️ 의견제출 마감 <b>${fmtDate(x.opinionDeadline)}</b></span>`
          : ''
      }
    </div>
    ${
      x.reason
        ? `<div class="summary"><span class="label">제안이유</span>${esc(x.reason)}</div>`
        : ''
    }
    ${
      x.mainContent
        ? `<div class="summary"><span class="label">주요내용</span>${esc(x.mainContent)}</div>`
        : ''
    }
    ${attachmentsHTML([
      ...(x.detailUrl ? [{ label: '입법예고 상세', url: x.detailUrl, direct: false }] : []),
      ...(x.attachments || []),
    ])}
  </article>`;
}

/* ---------- 필터/검색 ---------- */
function applyFilter(items) {
  const q = state.query.trim().toLowerCase();
  return items.filter((x) => {
    const hay = `${x.name || x.title || ''} ${x.ministry || ''} ${x.lawType || ''}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (state.filter) {
      const v = x[state.filter.key];
      if (state.filter.key === 'lawType') {
        if (!lawTypeMatches(v, state.filter.value)) return false;
      } else if (v !== state.filter.value) return false;
    }
    // 소관부처(대표부처) 필터
    if (state.ministry && primaryMinistry(x.ministry) !== state.ministry) return false;
    return true;
  });
}

function lawTypeMatches(type, group) {
  const c = lawTypeClass(type);
  return c === group;
}

function buildFilters() {
  const box = $('#filters');
  if (state.tab !== 'laws') {
    box.innerHTML = '';
    return;
  }

  // 1줄: 법령구분 필터
  const groups = [
    { label: '전체', value: null },
    { label: '법률', value: 'law' },
    { label: '대통령령', value: 'decree' },
    { label: '총리령·부령', value: 'rule' },
  ];
  const typeChips = groups
    .map(
      (g) =>
        `<button class="chip ${
          (state.filter?.value || null) === g.value ? 'is-active' : ''
        }" data-filterkey="lawType" data-filterval="${g.value ?? ''}">${g.label}</button>`
    )
    .join('');

  // 2줄: 소관부처 필터 (데이터에 존재하는 부처만, 건수 많은 순)
  const counts = {};
  state.laws.forEach((x) => {
    const m = primaryMinistry(x.ministry);
    counts[m] = (counts[m] || 0) + 1;
  });
  const ministries = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  const minChips =
    `<button class="chip ${state.ministry === null ? 'is-active' : ''}" data-ministry="">전체 부처</button>` +
    ministries
      .map(
        (m) =>
          `<button class="chip ${state.ministry === m ? 'is-active' : ''}" data-ministry="${esc(
            m
          )}">${esc(m)} <span class="chip-count">${counts[m]}</span></button>`
      )
      .join('');

  // 3줄: 부처별 그룹 표시 토글
  const groupToggle = `<button class="chip toggle ${
    state.groupByMinistry ? 'is-active' : ''
  }" data-grouptoggle="1">${state.groupByMinistry ? '☑' : '☐'} 부처별 묶어보기</button>`;

  box.innerHTML = `
    <div class="filter-row">${typeChips}</div>
    <div class="filter-row filter-ministry">${minChips}</div>
    <div class="filter-row">${groupToggle}</div>
  `;
}

/* ---------- 렌더 ---------- */
function render() {
  buildFilters();
  $('#count-laws').textContent = state.laws.length;
  $('#count-bills').textContent = state.bills.length;

  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('is-active', t.dataset.tab === state.tab)
  );
  document.querySelectorAll('.panel').forEach((p) =>
    p.classList.toggle('is-active', p.id === `panel-${state.tab}`)
  );

  if (state.tab === 'laws') {
    const items = applyFilter(state.laws);
    if (!items.length) {
      $('#panel-laws').innerHTML = `<p class="empty">조건에 맞는 법령이 없습니다.</p>`;
    } else if (state.groupByMinistry) {
      $('#panel-laws').innerHTML = renderGrouped(items);
    } else {
      $('#panel-laws').innerHTML = items.map(lawCard).join('');
    }
  } else {
    const panel = $('#panel-bills');
    if (!state.billsEnabled && state.bills.length === 0) {
      panel.innerHTML = billsNotice();
    } else {
      const items = applyFilter(state.bills);
      panel.innerHTML = items.length
        ? items.map(billCard).join('')
        : `<p class="empty">조건에 맞는 입법예고가 없습니다.</p>`;
    }
  }
}

// 부처별로 묶어서 렌더 (대표부처 기준, 부처 내 시행일 빠른 순)
function renderGrouped(items) {
  const groups = {};
  items.forEach((x) => {
    const m = primaryMinistry(x.ministry);
    (groups[m] = groups[m] || []).push(x);
  });
  // 건수 많은 부처부터
  const order = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);

  return order
    .map((m) => {
      const cards = groups[m]
        .slice()
        .sort((a, b) =>
          String(a.enforcementDate || '').localeCompare(String(b.enforcementDate || ''))
        )
        .map(lawCard)
        .join('');
      return `<section class="ministry-group">
        <h3 class="ministry-title">${esc(m)} <span class="ministry-count">${groups[m].length}건</span></h3>
        ${cards}
      </section>`;
    })
    .join('');
}

function billsNotice() {
  return `<div class="notice">
    <h3>정부입법예고 데이터 활성화 대기 중</h3>
    <p>공공데이터포털 <b>정부입법예고 OpenAPI</b> 인증키(serviceKey)가 등록되면 이 탭에 자동으로 표시됩니다.</p>
    <ol>
      <li><a href="https://www.data.go.kr/data/15058407/openapi.do" target="_blank" rel="noopener">data.go.kr · 법제처_정부입법예고</a> 에서 활용신청</li>
      <li>발급된 serviceKey 를 GitHub 저장소 → Settings → Secrets → <code>DATA_GO_KR_KEY</code> 로 등록</li>
      <li>다음 자동 수집(매일) 또는 수동 실행 시 입법예고가 채워집니다</li>
    </ol>
  </div>`;
}

/* ---------- 이벤트 ---------- */
function bindEvents() {
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      state.tab = t.dataset.tab;
      state.filter = null;
      state.ministry = null;
      render();
    })
  );

  $('#search').addEventListener('input', (e) => {
    state.query = e.target.value;
    render();
  });

  $('#filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;

    // 부처별 그룹 토글
    if (btn.dataset.grouptoggle) {
      state.groupByMinistry = !state.groupByMinistry;
      render();
      return;
    }
    // 소관부처 필터
    if (btn.hasAttribute('data-ministry')) {
      const m = btn.dataset.ministry || null;
      state.ministry = m;
      render();
      return;
    }
    // 법령구분 필터
    if (btn.hasAttribute('data-filterval')) {
      const val = btn.dataset.filterval || null;
      state.filter = val ? { key: 'lawType', value: val } : null;
      render();
    }
  });

  // 첨부 한번에 열기
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open]');
    if (!btn) return;
    e.preventDefault();
    let urls = [];
    try {
      urls = JSON.parse(btn.dataset.open);
    } catch {}
    urls.forEach((u, i) => setTimeout(() => window.open(u, '_blank', 'noopener'), i * 120));
  });
}

/* ---------- 부트스트랩 ---------- */
async function init() {
  const [laws, bills, meta] = await Promise.all([
    loadJSON('./data/laws.json', []),
    loadJSON('./data/bills.json', []),
    loadJSON('./data/meta.json', null),
  ]);
  state.laws = Array.isArray(laws) ? laws : [];
  state.bills = Array.isArray(bills) ? bills : [];
  state.billsEnabled = !!meta?.sources?.bills?.enabled;

  const metaEl = $('#meta');
  if (meta?.updatedAt) {
    const dt = new Date(meta.updatedAt);
    const stamp = dt.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
    metaEl.innerHTML = `최종 갱신 <b>${stamp}</b>${meta.seed ? ' · 초기데이터' : ''}<br />법령 ${state.laws.length}건 · 입법예고 ${state.bills.length}건`;
  } else {
    metaEl.textContent = '';
  }

  bindEvents();
  render();
}

init();
