// 법령 모니터 프론트엔드 — 정적 JSON(data/*.json)을 읽어 렌더링한다.
// 모든 데이터는 빌드/수집 시점에 docs/data 로 생성되므로 CORS 문제가 없다.

const state = {
  tab: 'laws',
  query: '',
  filter: null, // {key, value}
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
  const groups = [
    { label: '전체', value: null },
    { label: '법률', value: 'law' },
    { label: '대통령령', value: 'decree' },
    { label: '총리령·부령', value: 'rule' },
  ];
  box.innerHTML = groups
    .map(
      (g) =>
        `<button class="chip ${
          (state.filter?.value || null) === g.value ? 'is-active' : ''
        }" data-filterkey="lawType" data-filterval="${g.value ?? ''}">${g.label}</button>`
    )
    .join('');
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
    $('#panel-laws').innerHTML = items.length
      ? items.map(lawCard).join('')
      : `<p class="empty">조건에 맞는 법령이 없습니다.</p>`;
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
    const val = btn.dataset.filterval || null;
    state.filter = val ? { key: 'lawType', value: val } : null;
    render();
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
