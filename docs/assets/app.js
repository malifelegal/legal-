// 법령 모니터 프론트엔드 — 정적 JSON(data/*.json)을 읽어 렌더링한다.
// 모든 데이터는 빌드/수집 시점에 docs/data 로 생성되므로 CORS 문제가 없다.

const state = {
  tab: 'laws',
  query: '',
  filter: null, // {key, value}
  ministries: [], // 선택된 소관부처(대표부처) 배열 — 비어있으면 전체
  groupByMinistry: true, // 부처별 그룹 표시 on/off
  laws: [],
  bills: [],
  featured: [], // 주요 법령(featured.json)
  billsEnabled: false,
  selected: {}, // 체크박스로 고른 주요 법령 후보 { key: lawObject }
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

// 법령 고유 키 (법령ID + 법령일련번호)
function lawKey(x) {
  return `${x.id || ''}_${x.mst || ''}`;
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
// selectable=true 이면 카드에 체크박스를 단다(법령 탭에서만)
function lawCard(x, selectable) {
  const cls = lawTypeClass(x.lawType);
  const future = isFuture(x.enforcementDate);
  const key = lawKey(x);
  const checked = !!state.selected[key];
  const checkbox = selectable
    ? `<label class="pick" title="주요 법령 후보로 선택">
         <input type="checkbox" data-pick="${esc(key)}" ${checked ? 'checked' : ''} />
       </label>`
    : '';
  return `<article class="card${checked && selectable ? ' is-picked' : ''}">
    <div class="card-head">
      <h2>${esc(x.name)}${x.abbr ? ` <span class="abbr">(${esc(x.abbr)})</span>` : ''}</h2>
      ${checkbox}
    </div>
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
    if (state.ministries.length > 0 && !state.ministries.includes(primaryMinistry(x.ministry))) {
      return false;
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
  // 법령 탭과 주요 법령 탭에서 필터 노출 (입법예고 탭은 없음)
  if (state.tab === 'bills') {
    box.innerHTML = '';
    return;
  }

  const source = state.tab === 'featured' ? state.featured : state.laws;

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

  const counts = {};
  source.forEach((x) => {
    const m = primaryMinistry(x.ministry);
    counts[m] = (counts[m] || 0) + 1;
  });
  const ministries = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  const sel = state.ministries;
  const allActive = sel.length === 0;
  const minChips =
    `<button class="chip ${allActive ? 'is-active' : ''}" data-ministry-all="1">전체 부처</button>` +
    ministries
      .map(
        (m) =>
          `<button class="chip ${sel.includes(m) ? 'is-active' : ''}" data-ministry="${esc(
            m
          )}">${sel.includes(m) ? '✓ ' : ''}${esc(m)} <span class="chip-count">${counts[m]}</span></button>`
      )
      .join('');

  const selInfo =
    sel.length > 0
      ? `<button class="chip clear" data-ministry-clear="1">선택 ${sel.length}개 해제 ✕</button>`
      : '';

  const groupToggle = `<button class="chip toggle ${
    state.groupByMinistry ? 'is-active' : ''
  }" data-grouptoggle="1">${state.groupByMinistry ? '☑' : '☐'} 부처별 묶어보기</button>`;

  box.innerHTML = `
    <div class="filter-row">${typeChips}</div>
    <div class="filter-row filter-ministry">${minChips}</div>
    <div class="filter-row">${selInfo}${groupToggle}</div>
  `;
}

/* ---------- 렌더 ---------- */
function render() {
  buildFilters();
  $('#count-laws').textContent = state.laws.length;
  $('#count-bills').textContent = state.bills.length;
  $('#count-featured').textContent = state.featured.length;

  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('is-active', t.dataset.tab === state.tab)
  );
  document.querySelectorAll('.panel').forEach((p) =>
    p.classList.toggle('is-active', p.id === `panel-${state.tab}`)
  );

  if (state.tab === 'laws') {
    const items = applyFilter(state.laws);
    renderLawPanel('#panel-laws', items, true);
    updateSelectbar();
  } else if (state.tab === 'featured') {
    $('#selectbar').hidden = true;
    const items = applyFilter(state.featured);
    if (!state.featured.length) {
      $('#panel-featured').innerHTML = featuredNotice();
    } else {
      renderLawPanel('#panel-featured', items, false);
    }
  } else {
    $('#selectbar').hidden = true;
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

function renderLawPanel(panelSel, items, selectable) {
  const panel = $(panelSel);
  if (!items.length) {
    panel.innerHTML = `<p class="empty">조건에 맞는 법령이 없습니다.</p>`;
    return;
  }
  if (state.groupByMinistry) {
    panel.innerHTML = renderGrouped(items, selectable);
  } else {
    panel.innerHTML = items.map((x) => lawCard(x, selectable)).join('');
  }
}

function renderGrouped(items, selectable) {
  const groups = {};
  items.forEach((x) => {
    const m = primaryMinistry(x.ministry);
    (groups[m] = groups[m] || []).push(x);
  });
  const order = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);

  return order
    .map((m) => {
      const cards = groups[m]
        .slice()
        .sort((a, b) =>
          String(b.promulgationDate || '').localeCompare(String(a.promulgationDate || ''))
        )
        .map((x) => lawCard(x, selectable))
        .join('');
      return `<section class="ministry-group">
        <h3 class="ministry-title">${esc(m)} <span class="ministry-count">${groups[m].length}건</span></h3>
        ${cards}
      </section>`;
    })
    .join('');
}

function featuredNotice() {
  return `<div class="notice">
    <h3>주요 법령이 아직 없습니다</h3>
    <p><b>법령 공포·시행</b> 탭에서 카드의 체크박스로 주요 법령을 고른 뒤,
    아래 <b>선택 목록 내보내기</b>로 만든 내용을 <code>docs/data/featured.json</code> 에 저장하면
    이 탭에 팀 공유용으로 표시됩니다.</p>
  </div>`;
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

/* ---------- 선택 바 ---------- */
function updateSelectbar() {
  const bar = $('#selectbar');
  const n = Object.keys(state.selected).length;
  $('#sel-count').textContent = n;
  bar.hidden = n === 0;
}

/* ---------- 내보내기 ---------- */
function openExport() {
  const list = Object.values(state.selected);
  // 시행일 빠른 순 정렬
  list.sort((a, b) =>
    String(a.enforcementDate || '').localeCompare(String(b.enforcementDate || ''))
  );
  $('#export-text').value = JSON.stringify(list, null, 2) + '\n';
  $('#export-modal').hidden = false;
}

function closeExport() {
  $('#export-modal').hidden = true;
}

/* ---------- 이벤트 ---------- */
function bindEvents() {
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      state.tab = t.dataset.tab;
      state.filter = null;
      state.ministries = [];
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
    if (btn.dataset.grouptoggle) {
      state.groupByMinistry = !state.groupByMinistry;
      render();
      return;
    }
    if (btn.dataset.ministryAll || btn.dataset.ministryClear) {
      state.ministries = [];
      render();
      return;
    }
    if (btn.hasAttribute('data-ministry')) {
      const m = btn.dataset.ministry;
      const i = state.ministries.indexOf(m);
      if (i >= 0) state.ministries.splice(i, 1);
      else state.ministries.push(m);
      render();
      return;
    }
    if (btn.hasAttribute('data-filterval')) {
      const val = btn.dataset.filterval || null;
      state.filter = val ? { key: 'lawType', value: val } : null;
      render();
    }
  });

  // 체크박스 선택 (이벤트 위임)
  document.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-pick]');
    if (!cb) return;
    const key = cb.dataset.pick;
    if (cb.checked) {
      // 전체 laws에서 해당 법령 객체 찾기
      const found = state.laws.find((x) => lawKey(x) === key);
      if (found) state.selected[key] = found;
    } else {
      delete state.selected[key];
    }
    // 카드 음영 갱신 + 선택바 갱신 (전체 재렌더 없이)
    const card = cb.closest('.card');
    if (card) card.classList.toggle('is-picked', cb.checked);
    updateSelectbar();
  });

  // 선택 해제 / 내보내기
  $('#sel-clear').addEventListener('click', () => {
    state.selected = {};
    render();
  });
  $('#sel-export').addEventListener('click', openExport);
  $('#modal-close').addEventListener('click', closeExport);
  $('#export-modal').addEventListener('click', (e) => {
    if (e.target.id === 'export-modal') closeExport();
  });
  $('#export-copy').addEventListener('click', () => {
    const ta = $('#export-text');
    ta.select();
    const done = () => {
      const btn = $('#export-copy');
      btn.textContent = '복사됨 ✓';
      setTimeout(() => (btn.textContent = '복사하기'), 1500);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(ta.value).then(done).catch(() => {
        document.execCommand('copy');
        done();
      });
    } else {
      document.execCommand('copy');
      done();
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
  const [laws, bills, featured, meta] = await Promise.all([
    loadJSON('./data/laws.json', []),
    loadJSON('./data/bills.json', []),
    loadJSON('./data/featured.json', []),
    loadJSON('./data/meta.json', null),
  ]);
  state.laws = Array.isArray(laws) ? laws : [];
  state.bills = Array.isArray(bills) ? bills : [];
  state.featured = Array.isArray(featured) ? featured : [];
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
