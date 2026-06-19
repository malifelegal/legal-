/* ──────────────────────────────────────────────────────────────────────────
 * 계약서 오타 검사기 (규칙/사전 기반, 100% 브라우저 내장)
 *  - 입력: 텍스트 붙여넣기 · PDF · Word(DOCX)
 *  - 외부 서버로 본문을 전송하지 않음 (파일 파싱도 브라우저에서 수행)
 *  - 자동 수정이 아니라 "검토 도우미"입니다. 최종 판단은 사람이 합니다.
 * ────────────────────────────────────────────────────────────────────────── */

/* ===== 1) 규칙 사전 ========================================================= */

// (가) 명백한 맞춤법 오류: 틀린 표기 → 올바른 표기
//     · 한국어는 단어 경계가 없어 substring 매칭을 쓰되, 문맥을 함께 보여줘
//       사람이 최종 판단하도록 한다.
const SPELLING_PAIRS = [
  // 되 / 돼
  ["되요", "돼요"], ["되서", "돼서"], ["되써", "돼서"], ["되써요", "돼서요"],
  ["됬", "됐"], ["됫", "됐"], ["안되요", "안 돼요"],
  // ㅂ니다 / 습니다
  ["임니다", "입니다"], ["습니디", "습니다"], ["함니다", "합니다"],
  ["읍니다", "습니다"], ["했슴니다", "했습니다"], ["슴니다", "습니다"],
  ["됬습니다", "됐습니다"],
  // 자주 틀리는 일반 어휘
  ["역활", "역할"], ["어떻해", "어떡해"], ["금새", "금세"], ["몇일", "며칠"],
  ["오랫만", "오랜만"], ["웬지", "왠지"], ["왠만", "웬만"], ["희안", "희한"],
  ["설겆이", "설거지"], ["닥달", "닦달"], ["통채로", "통째로"], ["핑게", "핑계"],
  ["갯수", "개수"], ["촛점", "초점"], ["댓가", "대가"], ["단언컨데", "단언컨대"],
  ["요컨데", "요컨대"], ["깨끗히", "깨끗이"], ["틈틈히", "틈틈이"],
  ["일일히", "일일이"], ["곰곰히", "곰곰이"], ["번번히", "번번이"],
  // 율 / 률 (받침 없거나 ㄴ받침이면 '율', 그 외엔 '률')
  ["비률", "비율"], ["확율", "확률"], ["백분률", "백분율"],
  ["경쟁율", "경쟁률"], ["합격율", "합격률"], ["출석율", "출석률"],
  ["성공율", "성공률"], ["등록율", "등록률"], ["할인률", "할인율"],
  ["이자률", "이자율"],
  // 계약/법무 문서에서 흔한 오타
  ["게약", "계약"], ["채결", "체결"], ["변갱", "변경"], ["승락", "승낙"],
  ["날임", "날인"], ["귀책사우", "귀책사유"], ["손해배생", "손해배상"],
  ["효녁", "효력"], ["위약끔", "위약금"], ["계약셔", "계약서"],
  ["당사자간", "당사자 간"],
];

// (나) 뜻이 달라 자주 혼동되는 법무/비즈니스 용어 → "오류"가 아니라 "검토" 표시
const CONFUSABLE = [
  { re: /결제/g, note: "‘결제’(대금 지급) ↔ ‘결재’(승인) 혼동 주의" },
  { re: /결재/g, note: "‘결재’(승인) ↔ ‘결제’(대금 지급) 혼동 주의" },
  { re: /갱신/g, note: "‘갱신’(기간 연장·다시 새롭게) ↔ ‘경신’(기록 등) 구분" },
  { re: /경신/g, note: "‘경신’ ↔ ‘갱신’(계약 연장) 구분 — 계약이면 ‘갱신’" },
  { re: /해지/g, note: "‘해지’(장래효) ↔ ‘해제’(소급효) — 효과가 다르니 확인" },
  { re: /해제/g, note: "‘해제’(소급효) ↔ ‘해지’(장래효) — 효과가 다르니 확인" },
  { re: /손해보상/g, note: "계약상으로는 보통 ‘손해배상’ — 의도 확인" },
  { re: /일체/g, note: "‘일체’(모두·전부) ↔ ‘일절’(전혀·금지) 구분" },
  { re: /일절/g, note: "‘일절’(전혀·금지) ↔ ‘일체’(모두) 구분" },
  { re: /지체없이|지체 없이/g, note: "기한 표현 — ‘지체 없이/즉시/○일 이내’ 등 일관성 확인" },
];

// (다) 형식·문장부호 검사 (정규식 기반)
function buildFormatFindings(text) {
  const out = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, i) => {
    const ln = i + 1;

    // 연속 공백 2칸 이상
    let m;
    const dbl = /\S(  +)\S/g;
    while ((m = dbl.exec(line))) {
      out.push(mk(ln, line, m.index + 1, m[1], "format", "공백이 2칸 이상 연속됩니다.", "공백 1칸"));
    }

    // 문장부호 앞 공백 (한글/영문 + 공백 + 마침표·쉼표·닫는괄호 등)
    const sp = / +([,.)\]}」』%])/g;
    while ((m = sp.exec(line))) {
      out.push(mk(ln, line, m.index, m[0], "format", `‘${m[1]}’ 앞 불필요한 공백`, m[1]));
    }

    // 같은 단어 연속 반복 (예: "계약 계약")
    const rep = /([가-힣A-Za-z]{2,})\s+\1(?![가-힣A-Za-z])/g;
    while ((m = rep.exec(line))) {
      out.push(mk(ln, line, m.index, m[0], "repeat", `‘${m[1]}’ 단어가 연속 반복됩니다.`, m[1]));
    }

    // 같은 글자 3회 이상 연속 (예: "좋좋좋")
    const syl = /([가-힣])\1\1+/g;
    while ((m = syl.exec(line))) {
      out.push(mk(ln, line, m.index, m[0], "repeat", "같은 글자가 3회 이상 연속됩니다.", ""));
    }

    // 마침표/쉼표 중복 (..  ,,) — 단, 말줄임 …나 ... 일부 허용은 안 함(검토용)
    const dot = /([,.])\1{1,}/g;
    while ((m = dot.exec(line))) {
      out.push(mk(ln, line, m.index, m[0], "format", "문장부호가 중복되었습니다.", m[1]));
    }
  });

  return out;
}

// (라) 괄호·따옴표 짝 검사 (문서 전체)
function buildBracketFindings(text) {
  const pairs = [["(", ")"], ["[", "]"], ["{", "}"], ["「", "」"], ["『", "』"], ["《", "》"], ["〈", "〉"]];
  const out = [];
  for (const [open, close] of pairs) {
    const o = (text.match(new RegExp("\\" + open, "g")) || []).length;
    const c = (text.match(new RegExp("\\" + close, "g")) || []).length;
    if (o !== c) {
      out.push({
        line: 0, cat: "bracket", weight: 2,
        msg: `괄호 ‘${open} ${close}’ 짝이 맞지 않습니다. (여는 ${o}개 / 닫는 ${c}개)`,
        suggest: "", context: "", mark: open + close,
      });
    }
  }
  // 큰/작은따옴표 홀짝
  for (const q of ['"', "'"]) {
    const cnt = (text.match(new RegExp(q, "g")) || []).length;
    if (cnt % 2 === 1) {
      out.push({
        line: 0, cat: "bracket", weight: 1,
        msg: `따옴표 ‘${q}’ 개수가 홀수(${cnt}개)입니다. 짝을 확인하세요.`,
        suggest: "", context: "", mark: q,
      });
    }
  }
  return out;
}

/* ===== 2) 검사 실행 ========================================================= */

function mk(line, lineText, idx, matched, cat, msg, suggest) {
  // 매치 부분을 강조한 문맥(앞뒤 잘라내기)
  const before = lineText.slice(Math.max(0, idx - 24), idx);
  const after = lineText.slice(idx + matched.length, idx + matched.length + 24);
  return {
    line, cat,
    weight: cat === "spelling" ? 3 : cat === "repeat" ? 2 : 1,
    msg, suggest, mark: matched,
    contextBefore: (idx > 24 ? "…" : "") + before,
    contextAfter: after + (lineText.length > idx + matched.length + 24 ? "…" : ""),
  };
}

function runChecks(text) {
  const findings = [];
  const lines = text.split(/\r?\n/);

  // (가) 맞춤법 사전
  for (const [wrong, right] of SPELLING_PAIRS) {
    const re = new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    lines.forEach((line, i) => {
      let m;
      while ((m = re.exec(line))) {
        findings.push(
          mk(i + 1, line, m.index, m[0], "spelling",
             `맞춤법: ‘${wrong}’ → ‘${right}’`, right)
        );
      }
    });
  }

  // (나) 혼동 용어 (검토)
  for (const rule of CONFUSABLE) {
    lines.forEach((line, i) => {
      let m;
      rule.re.lastIndex = 0;
      while ((m = rule.re.exec(line))) {
        findings.push(
          mk(i + 1, line, m.index, m[0], "confuse", rule.note, "")
        );
      }
    });
  }

  // (다) 형식 / (라) 괄호
  findings.push(...buildFormatFindings(text));
  findings.push(...buildBracketFindings(text));

  // 정렬: 줄번호 → 가중치
  findings.sort((a, b) => (a.line - b.line) || (b.weight - a.weight));
  return findings;
}

/* ===== 3) 참고 통계 ========================================================= */

function buildStats(text) {
  const chars = text.replace(/\s/g, "").length;
  const lineCount = text.split(/\r?\n/).filter((l) => l.trim()).length;
  // 금액(원) 추출
  const amounts = [...text.matchAll(/[0-9][0-9,]*\s*원/g)].map((m) => m[0].trim());
  // 날짜 추출 (YYYY.MM.DD / YYYY년 MM월 DD일 / YYYY-MM-DD)
  const dates = [
    ...text.matchAll(/\d{4}\s*[.\-년]\s*\d{1,2}\s*[.\-월]\s*\d{1,2}\s*일?/g),
  ].map((m) => m[0].trim());
  // 갑/을 등 당사자 표기(추정): 앞은 비한글, 뒤는 문장부호/공백 또는 조사일 때만.
  // 단어 첫 글자가 우연히 갑/을/병/정인 경우(병원·정도·갑자기 등) 오탐을 줄이려 2회 이상만 인정.
  // 단일 글자 조사는 문자클래스로, 두 글자 이상 조사는 대안으로.
  // 병/정은 ‘정의·정도·병원’ 등 일반어와 겹쳐 오탐이 커서 제외(대부분 계약 당사자는 갑/을).
  const parties = ["갑", "을"].filter((p) => {
    const re = new RegExp(`(^|[^가-힣])${p}(?=[\\s,.)\\]」』'"은는이가을를과와의에도만]|에게|에서|으로|및)`, "g");
    return (text.match(re) || []).length >= 2;
  });
  return {
    chars, lineCount,
    amounts: [...new Set(amounts)],
    dates: [...new Set(dates)],
    parties,
  };
}

/* ===== 4) 파일 → 텍스트 추출 =============================================== */

async function extractFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) {
    return await file.text();
  }
  if (name.endsWith(".docx")) {
    if (!window.mammoth) throw new Error("DOCX 파서를 불러오지 못했습니다. 네트워크 연결을 확인하세요.");
    const buf = await file.arrayBuffer();
    const res = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return res.value || "";
  }
  if (name.endsWith(".doc")) {
    throw new Error("구버전 .doc 는 지원하지 않습니다. .docx 로 저장해 주세요.");
  }
  if (name.endsWith(".pdf")) {
    if (!window.pdfjsLib) throw new Error("PDF 파서를 불러오지 못했습니다. 네트워크 연결을 확인하세요.");
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let out = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // 같은 줄 묶기: y좌표가 바뀌면 줄바꿈
      let lastY = null, line = "";
      for (const it of content.items) {
        const y = it.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 3) {
          out += line.trimEnd() + "\n";
          line = "";
        }
        line += it.str + (it.hasEOL ? "\n" : "");
        lastY = y;
      }
      out += line + "\n\n";
    }
    return out;
  }
  throw new Error("지원하지 않는 형식입니다. (txt · docx · pdf 만 가능)");
}

/* ===== 5) UI 연결 =========================================================== */

const $ = (s) => document.querySelector(s);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const CAT_META = {
  spelling: { label: "맞춤법", cls: "c-spell" },
  repeat:   { label: "반복/중복", cls: "c-rep" },
  format:   { label: "띄어쓰기·부호", cls: "c-fmt" },
  bracket:  { label: "괄호·따옴표", cls: "c-fmt" },
  confuse:  { label: "용어 검토", cls: "c-conf" },
};

function render(findings, stats) {
  const summary = $("#summary");
  const list = $("#results");
  const statBox = $("#stats");

  // 카테고리별 카운트
  const counts = {};
  for (const f of findings) counts[f.cat] = (counts[f.cat] || 0) + 1;

  const errCount = findings.filter((f) => f.cat !== "confuse").length;
  const confCount = counts.confuse || 0;

  summary.hidden = false;
  summary.innerHTML =
    `<div class="sum-num ${errCount ? "bad" : "good"}">${errCount}</div>` +
    `<div class="sum-text">` +
    `<b>${errCount === 0 ? "잠재 오류가 발견되지 않았습니다." : `잠재 오류 ${errCount}건`}</b>` +
    (confCount ? ` · 용어 검토 ${confCount}건` : "") +
    `<div class="sum-cats">` +
    Object.keys(CAT_META).filter((k) => counts[k]).map((k) =>
      `<span class="badge2 ${CAT_META[k].cls}">${CAT_META[k].label} ${counts[k]}</span>`
    ).join("") +
    `</div></div>` +
    `<button id="copy-result" class="mini-btn">결과 복사</button>`;

  // 결과 목록
  if (!findings.length) {
    list.innerHTML = `<p class="empty2">✅ 규칙 사전에 걸리는 항목이 없습니다.<br><span>※ 규칙 기반 검사라 문맥상 오타는 놓칠 수 있습니다. 최종 검토는 직접 해주세요.</span></p>`;
  } else {
    list.innerHTML = findings.map((f) => {
      const cm = CAT_META[f.cat] || CAT_META.format;
      const ctx = f.context !== undefined && f.line === 0
        ? ""
        : `<div class="r-ctx">${esc(f.contextBefore || "")}<mark>${esc(f.mark || "")}</mark>${esc(f.contextAfter || "")}</div>`;
      const loc = f.line ? `L${f.line}` : "전체";
      const sug = f.suggest ? `<span class="r-sug">→ ${esc(f.suggest)}</span>` : "";
      return `<div class="r-item">
        <div class="r-top">
          <span class="badge2 ${cm.cls}">${cm.label}</span>
          <span class="r-loc">${loc}</span>
          <span class="r-msg">${esc(f.msg)} ${sug}</span>
        </div>
        ${ctx}
      </div>`;
    }).join("");
  }

  // 참고 통계
  statBox.hidden = false;
  statBox.innerHTML =
    `<h3>📊 참고 정보</h3>
     <div class="stat-grid">
       <div><span>글자 수(공백 제외)</span><b>${stats.chars.toLocaleString()}</b></div>
       <div><span>내용 줄 수</span><b>${stats.lineCount.toLocaleString()}</b></div>
       <div><span>당사자 표기(추정)</span><b>${stats.parties.length ? stats.parties.join(" · ") : "—"}</b></div>
     </div>
     ${listBlock("💰 금액(원) 표기 — 숫자/한글 금액 일치 확인", stats.amounts)}
     ${listBlock("📅 날짜 표기 — 기간·기한 일관성 확인", stats.dates)}`;

  // 결과 복사 버튼
  const copyBtn = $("#copy-result");
  if (copyBtn) {
    copyBtn.onclick = () => {
      const txt = findings.map((f) =>
        `[${(CAT_META[f.cat] || {}).label || f.cat}] ${f.line ? "L" + f.line : "전체"}  ${f.msg}${f.suggest ? " (→ " + f.suggest + ")" : ""}`
      ).join("\n");
      navigator.clipboard.writeText(txt || "발견된 항목 없음").then(() => {
        copyBtn.textContent = "복사됨 ✓";
        setTimeout(() => (copyBtn.textContent = "결과 복사"), 1500);
      });
    };
  }
}

function listBlock(title, arr) {
  if (!arr.length) return "";
  return `<div class="stat-list"><h4>${title} <span>(${arr.length})</span></h4>
    <div class="chips2">${arr.slice(0, 60).map((a) => `<span>${esc(a)}</span>`).join("")}
    ${arr.length > 60 ? `<span class="more">+${arr.length - 60}</span>` : ""}</div></div>`;
}

function analyze(text) {
  text = (text || "").replace(/ /g, " "); // NBSP 정규화
  if (!text.trim()) {
    $("#summary").hidden = true;
    $("#results").innerHTML = "";
    $("#stats").hidden = true;
    return;
  }
  const findings = runChecks(text);
  const stats = buildStats(text);
  render(findings, stats);
}

/* ===== 6) 이벤트 바인딩 ===================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const ta = $("#input");
  const status = $("#file-status");

  // 검사 버튼 / 입력
  $("#run").addEventListener("click", () => analyze(ta.value));
  $("#clear").addEventListener("click", () => {
    ta.value = "";
    status.textContent = "";
    analyze("");
  });

  // 파일 업로드 (버튼 + 드래그앤드롭)
  const fileInput = $("#file");
  const drop = $("#drop");

  async function handleFile(file) {
    if (!file) return;
    status.innerHTML = `<span class="spin"></span> ‘${esc(file.name)}’ 읽는 중…`;
    try {
      const text = await extractFromFile(file);
      ta.value = text;
      status.textContent = `‘${file.name}’ 불러옴 — 글자 ${text.replace(/\s/g, "").length.toLocaleString()}자`;
      analyze(text);
    } catch (e) {
      status.innerHTML = `<span class="err">⚠ ${esc(e.message || String(e))}</span>`;
    }
  }

  fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); })
  );
  drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));

  // 샘플 채우기
  const sample = $("#sample");
  if (sample) sample.addEventListener("click", () => {
    ta.value = SAMPLE_TEXT;
    analyze(SAMPLE_TEXT);
  });
});

// 데모용 샘플(일부러 오타 포함)
const SAMPLE_TEXT = `제1조(목적) 본 계약은 갑과 을 사이의  용역 제공에 관한 사항을 정함을 목적으로 한다.
제2조(계약금액) 계약 금액은 금 5,000,000 원으로 하며, 을은 대금을 결재한다.
제3조(계약 기간) 계약 기간은 2026.01.01 부터 2026.12.31 까지로 하며, 만료 시 자동 갱신된다.
제4조(해제) 일방이 계약을 위반한 경우 상대방은 본 계약을 해지할 수 있다.
제5조(손해보상) 위반 당사자는 상대방에게 손해를 손해를 배상하여야 한다.
제6조(효력) 본 계약은 서명 날인일로 부터 효력이 발생되요.`;
