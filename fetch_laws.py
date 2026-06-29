#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
법령 모니터링 자동화 - Python 수집 스크립트 (모듈 1)
미래에셋생명 법무팀 | 법제처 OpenAPI + data.go.kr 입법예고 API

실행 방법 (Windows CMD):
  set LAW_OC=발급받은OC && python fetch_laws.py
  (선택) set DATA_GO_KR_KEY=입법예고키 && python fetch_laws.py

출력: docs/data/laws.json, docs/data/bills.json, docs/data/meta.json
"""

import os, json, time, datetime, pathlib, urllib.request, urllib.parse

INSURANCE_KEYWORDS = [
    "보험", "보험업", "생명보험", "손해보험",
    "금융소비자", "금융위원회", "금융감독원",
    "자본시장", "금융지주", "은행법",
    "개인정보", "전자금융", "전자서명",
    "근로기준", "세법", "법인세", "소득세",
    "공정거래", "상법", "민법",
]

RECENT_DAYS = int(os.environ.get("LAWS_RECENT_DAYS", "30"))
LAWS_DISPLAY = int(os.environ.get("LAWS_DISPLAY", "300"))
BILLS_DISPLAY = int(os.environ.get("BILLS_DISPLAY", "60"))
LAW_OC = os.environ.get("LAW_OC", "")
DATA_GO_KR_KEY = os.environ.get("DATA_GO_KR_KEY", "")
SCRIPT_DIR = pathlib.Path(__file__).parent
DATA_DIR = SCRIPT_DIR / "docs" / "data"

def fmt_date(v):
    s = str(v or "").strip()
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 and s.isdigit() else s or None

def is_recent(date_str):
    if not date_str: return False
    try:
        d = datetime.date.fromisoformat(date_str)
        return d >= datetime.date.today() - datetime.timedelta(days=RECENT_DAYS)
    except: return False

def has_keyword(name):
    return any(kw in name for kw in INSURANCE_KEYWORDS)

def fetch_url(url, max_retry=3, timeout=20):
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    last_err = None
    for attempt in range(1, max_retry + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            last_err = e
            print(f"  [재시도 {attempt}/{max_retry}] {type(e).__name__}: {e}")
            if attempt < max_retry: time.sleep(2 * attempt)
    raise RuntimeError(f"최종 실패: {last_err}")

def law_links(ls_id, mst, name):
    enc = urllib.parse.quote(name)
    base = "https://www.law.go.kr/LSW/lsInfoP.do"
    q = f"lsId={ls_id}&lsiSeq={mst}&chrClsCd=010202"
    return {
        "fullText": f"https://www.law.go.kr/법령/{enc}",
        "oldNew": f"{base}?{q}&viewCls=lsOldAndNew&urlMode=lsOldAndNew",
        "reason": f"{base}?{q}&viewCls=lsRvsDoc&urlMode=lsRvsDoc",
    }

def fetch_laws():
    if not LAW_OC:
        raise ValueError("LAW_OC 환경변수 미설정. set LAW_OC=발급받은OC")
    qs = urllib.parse.urlencode({"OC": LAW_OC, "type": "JSON", "target": "law", "sort": "ddes", "display": LAWS_DISPLAY, "page": 1})
    data = fetch_url(f"https://www.law.go.kr/DRF/lawSearch.do?{qs}")
    rows = data.get("LawSearch", {}).get("law", [])
    if isinstance(rows, dict): rows = [rows]
    items = []
    for row in rows:
        ls_id = str(row.get("법령ID", "")).strip()
        mst = str(row.get("법령일련번호", "")).strip()
        name = str(row.get("법령명한글", "")).strip()
        if not ls_id or not name: continue
        prom = fmt_date(row.get("공포일자", ""))
        if not is_recent(prom): continue
        links = law_links(ls_id, mst, name)
        items.append({
            "id": ls_id, "mst": mst, "name": name,
            "abbr": str(row.get("법령약칭명", "")).strip() or None,
            "lawType": str(row.get("법령구분명", "")).strip() or None,
            "revisionType": str(row.get("제개정구분명", "")).strip() or None,
            "ministry": str(row.get("소관부처명", "")).strip() or None,
            "promulgationDate": prom,
            "enforcementDate": fmt_date(row.get("시행일자", "")),
            "isRelevant": has_keyword(name),
            "links": links,
            "attachments": [
                {"label": "법령 본문", "kind": "law", "url": links["fullText"], "direct": False},
                {"label": "신구조문대비표", "kind": "oldnew", "url": links["oldNew"], "direct": False},
                {"label": "제·개정문 / 이유", "kind": "reason", "url": links["reason"], "direct": False},
            ],
        })
    items.sort(key=lambda x: x.get("promulgationDate") or "", reverse=True)
    print(f"[laws] {len(items)}건 수집 (관련 {sum(1 for x in items if x['isRelevant'])}건)")
    return items

def fetch_bills():
    if not DATA_GO_KR_KEY:
        print("[bills] DATA_GO_KR_KEY 미설정 — 건너뜀")
        return {"enabled": False, "items": []}
    list_url = os.environ.get("DATA_GO_KR_BILLS_LIST_URL", "https://apis.data.go.kr/1170000/lawAdvanceNotice/lawSearchList.do")
    qs = urllib.parse.urlencode({"serviceKey": DATA_GO_KR_KEY, "type": "json", "numOfRows": BILLS_DISPLAY, "pageNo": 1})
    data = fetch_url(f"{list_url}?{qs}")
    rows = (data.get("response", {}).get("body", {}).get("items", {}).get("item")
            or data.get("items") or [])
    if isinstance(rows, dict): rows = [rows]
    def pick(obj, *keys):
        for k in keys:
            v = obj.get(k)
            if v is not None and str(v).strip(): return str(v).strip()
        return None
    items = [{"id": pick(r, "입법예고일련번호", "id"), "title": pick(r, "입법예고명", "title"),
              "ministry": pick(r, "소관부처명"), "noticeDate": fmt_date(pick(r, "공고일자") or ""),
              "opinionDeadline": fmt_date(pick(r, "의견제출마감일") or ""),
              "reason": pick(r, "제안이유"), "mainContent": pick(r, "주요내용"),
              "detailUrl": pick(r, "입법예고상세링크"), "attachments": []}
             for r in rows if pick(r, "입법예고명", "title")]
    items.sort(key=lambda x: x.get("noticeDate") or "", reverse=True)
    print(f"[bills] {len(items)}건 수집")
    return {"enabled": True, "items": items}

def read_json(path, default):
    try: return json.loads(pathlib.Path(path).read_text("utf-8"))
    except: return default

def write_json(name, obj):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"  저장: {DATA_DIR / name}")

def main():
    print("=" * 50)
    print(f"법령 수집 시작 | {datetime.date.today()} | 최근 {RECENT_DAYS}일")
    print("=" * 50)
    meta = {"updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "oc": f"{LAW_OC[:3]}***" if LAW_OC else None, "sources": {}}
    try:
        laws = fetch_laws(); write_json("laws.json", laws)
        meta["sources"]["laws"] = {"ok": True, "count": len(laws)}
    except Exception as e:
        prev = read_json(DATA_DIR / "laws.json", [])
        write_json("laws.json", prev)
        meta["sources"]["laws"] = {"ok": False, "count": len(prev), "error": str(e)}
        print(f"[laws] 실패: {e}")
    try:
        result = fetch_bills()
        write_json("bills.json", result["items"] if result["enabled"] else read_json(DATA_DIR / "bills.json", []))
        meta["sources"]["bills"] = {"ok": True, "enabled": result["enabled"], "count": len(result["items"])}
    except Exception as e:
        prev = read_json(DATA_DIR / "bills.json", [])
        write_json("bills.json", prev)
        meta["sources"]["bills"] = {"ok": False, "count": len(prev), "error": str(e)}
        print(f"[bills] 실패: {e}")
    write_json("meta.json", meta)
    print("\n✅ 완료 —", json.dumps(meta["sources"], ensure_ascii=False))

if __name__ == "__main__":
    main()
