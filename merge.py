#!/usr/bin/env python3
# 盧琴樹 雙11 線下×線上 抽獎名單合併
#
# 流程：線下表單 CSV ×（FB／IG 留言名單）→ 只留「有填表且有留言」→ 合併線上名單
#       → 以電話（正規化）／Email（小寫）／發票號碼／訂單編號（有填才比）去重 → 輸出 canonical CSV
#       → 可選 verify.py 風格抽籤：SHA-256(seed|id) 由小到大排序
#
# 用法：
#   python3 merge.py form.csv fb_comments.csv ig_comments.csv [--online online.csv]
#        [-o canonical.csv] [--platform FB|IG|auto] [--id-col 欄位名]
#        [--draw 10 --seed "seed"] [--demo]
#
#   --platform：強制指定所有留言檔的平台；預設依檔名偵測（含 fb→FB、含 ig→IG，
#                偵測不到則用 auto＝兩邊留言都列入比對）
#   --demo：不帶檔案，直接用內建範例資料跑一遍（輸出到 demo_output/）
import csv, io, re, hashlib, unicodedata, argparse, os

# ---- 正規化（與 validate.js、Code.gs 完全同一套規則）-------------------
def norm_account(s):
    s = unicodedata.normalize("NFC", str(s or "")).strip().lower()
    s = re.sub(r"\s+", "", s)                                     # 去空白
    s = re.sub(r"^(?:https?://)?(?:(?:www|m|mobile)\.)?"
               r"(?:instagram\.com|instagr\.am|facebook\.com|fb\.com|fb\.me)/", "", s)  # 去網址前綴
    s = s.strip("/").lstrip("@＠")                                # 去斜線、去 @／全形＠
    return s

def norm_phone(s):
    d = re.sub(r"[^0-9]", "", str(s or ""))
    if not d:
        return ""
    if d[:3] == "886":
        return "886" + d[4:] if d[3:4] == "0" else d
    if d[0] == "0":
        return "886" + d[1:]
    if len(d) == 9:
        return "886" + d
    return d

def norm_email(s):
    return str(s or "").strip().lower()

def norm_invoice(s):
    return re.sub(r"-", "", str(s or "").strip().upper())

def norm_order_id(s):
    return str(s or "").strip().upper()

def dedupe_keys(e):
    ks = []
    p, em, iv = norm_phone(e.get("phone")), norm_email(e.get("email")), norm_invoice(e.get("invoice"))
    oid = norm_order_id(e.get("orderId") or e.get("訂單編號"))
    if p:  ks.append(("電話", p))
    if em: ks.append(("Email", em))
    if iv: ks.append(("發票", iv))
    if oid: ks.append(("訂單", oid))
    return ks

# ---- CSV 讀取與欄位對應 ---------------------------------------------------
def read_rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return [r for r in csv.reader(f) if any(str(c).strip() for c in r)]

def find_col(headers, pats, exclude=()):
    for i, h in enumerate(headers):
        hs = str(h).strip().lower()
        if hs and any(re.search(p, hs) for p in pats) and not any(re.search(p, hs) for p in exclude):
            return i
    return None

def load_form_csv(path, source):
    """線下表單（Code.gs「線下登記」欄位）或線上 Google 表單回覆，依標題關鍵字對欄。"""
    rows = read_rows(path)
    if not rows:
        return []
    h = rows[0]
    c_name  = find_col(h, [r"姓名", r"^name$"])
    c_email = find_col(h, [r"email", r"電子郵件"])
    c_phone = find_col(h, [r"電話", r"^phone$"])
    c_amt   = find_col(h, [r"金額", r"amount"])
    c_plat  = find_col(h, [r"平台", r"fb 或 ig", r"fb/ig"], exclude=[r"名稱", r"帳號"])
    c_acc   = find_col(h, [r"帳號名稱", r"fb 或 ig 名稱", r"帳號", r"帳戶", r"帳户",
                           r"username", r"account", r"user", r"名稱"], exclude=[r"訂單"])
    c_inv   = find_col(h, [r"發票"])
    c_order = find_col(h, [r"訂單編號", r"order[\s_]*id", r"^order$"])
    c_mkt   = find_col(h, [r"行銷"])
    c_store = find_col(h, [r"門市", r"^store$"])
    c_ts    = find_col(h, [r"提交時間", r"時間戳", r"timestamp", r"^日期$"])
    entries = []
    for r in rows[1:]:
        g = lambda c: (r[c] if c is not None and c < len(r) else "").strip()  # noqa: E731
        if not (g(c_name) or g(c_acc)):
            continue
        plat = "FB" if "FB" in g(c_plat).upper() else "IG"
        entries.append({
            "name": g(c_name), "email": g(c_email), "phone": g(c_phone),
            "amount": g(c_amt), "platform": plat, "account": g(c_acc),
            "invoice": g(c_inv), "orderId": g(c_order), "marketing": g(c_mkt), "store": g(c_store),
            "ts": g(c_ts), "source": source,
        })
    return entries

def load_comments(path, force_platform):
    """留言名單：支援 CSV（找帳號欄）或純文字（一行一帳號）。回傳 (platform, [正規化帳號])。"""
    name = os.path.basename(path).lower()
    if force_platform in ("FB", "IG"):
        plat = force_platform
    elif "fb" in name:
        plat = "FB"
    elif "ig" in name:
        plat = "IG"
    else:
        plat = "auto"
    rows = read_rows(path)
    if not rows:
        return plat, []
    # 有表頭的 CSV：找出帳號欄；單欄純文字檔：整檔當一行一帳號
    header = [str(c).strip() for c in rows[0]]
    c_acc = find_col(header, [r"帳號", r"帳戶", r"帳户", r"user", r"name", r"account", r"留言"])
    has_header = c_acc is not None and bool(
        re.search(r"帳號|帳戶|帳户|user|name|account|留言", header[c_acc], re.I))
    if c_acc is None and len(header) == 1:
        c_acc, has_header = 0, False
    body = rows[1:] if has_header else rows
    accs = {norm_account(r[c_acc]) for r in body if c_acc < len(r)}
    accs.discard("")
    return plat, sorted(accs)

# ---- 比對與合併 -----------------------------------------------------------
def match_offline(entries, sets):
    """只保留「有表單且有留言」。採聯集比對：填 FB 但留言在 IG（或相反）也算有留言。"""
    qualified, rejected = [], []
    for e in entries:
        own = e["platform"]
        acc = norm_account(e.get("account"))
        hit = None
        if acc and acc in sets.get(own, set()):
            hit = own
        elif acc and acc in sets.get("FB" if own == "IG" else "IG", set()):
            hit = "FB" if own == "IG" else "IG"
        if acc and hit:
            e2 = dict(e)
            e2["matched_platform"] = hit
            e2["account_norm"] = acc
            e2["entry_id"] = f'{own}:{acc}'
            qualified.append(e2)
        else:
            e2 = dict(e)
            e2["reject_reason"] = "帳號沒有在留言名單找到（沒留言不算參加）" if acc else "缺帳號名稱"
            rejected.append(e2)
    return qualified, rejected

def dedupe_merge(source_lists):
    seen, merged, dropped = {}, [], []
    for source, entries in source_lists:
        for e in entries:
            ks = dedupe_keys(e)
            hit = next((k for k in ks if k in seen), None)
            if hit:
                e2 = dict(e)
                e2["source"] = source
                e2["dedupe_note"] = f"與名單第 {seen[hit] + 1} 筆重複（{hit[0]}）"
                dropped.append(e2)
            else:
                idx = len(merged) + 1  # 1-based，與 CSV 列號對齊
                for k in ks:
                    seen[k] = idx - 1
                e2 = dict(e)
                e2["source"] = source
                merged.append(e2)
    # 標準 ID 唯一化（極端情況：不同人同帳號名且都沒撞到去重鍵）
    used, out = set(), []
    for e in merged:
        eid = e.get("entry_id") or f'{e["platform"]}:{norm_account(e.get("account"))}'
        n, base = 2, eid
        while eid in used:
            eid = f"{base}#{n}"
            n += 1
        used.add(eid)
        e2 = dict(e)
        e2["entry_id"] = eid
        out.append(e2)
    return out, dropped

# ---- 輸出 -----------------------------------------------------------------
CANONICAL_HEADER = ["標準ID", "姓名", "Email", "電話", "消費金額", "平台", "帳號名稱",
                    "發票號碼", "行銷同意", "門市", "來源", "比對平台", "提交時間"]

def write_csv(path, header, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        for r in rows:
            w.writerow(r)

def draw(ids, seed, n):
    """verify.py 風格：list_hash + SHA-256(seed|id) 由小到大取前 n 名。"""
    keys = sorted(ids)
    print("list_hash", hashlib.sha256("\n".join(keys).encode()).hexdigest())
    ranked = sorted((hashlib.sha256(f"{seed}|{k}".encode()).hexdigest(), k) for k in keys)
    for i, (h, k) in enumerate(ranked[:n], 1):
        print(i, k, h)

# ---- 主流程 ----------------------------------------------------------------
def run(form_entries, comment_sets, online_entries, out_path, draw_n=None, seed=None):
    qualified, rejected = match_offline(form_entries, comment_sets)
    merged, dropped = dedupe_merge([("線下", qualified), ("線上", online_entries)])

    rows = [[e.get("entry_id", ""), e.get("name", ""), e.get("email", ""), e.get("phone", ""),
             e.get("amount", ""), e.get("platform", ""), e.get("account", ""), e.get("invoice", ""),
             e.get("marketing", ""), e.get("store", ""), e.get("source", ""),
             e.get("matched_platform", ""), e.get("ts", "")] for e in merged]
    write_csv(out_path, CANONICAL_HEADER, rows)

    base = re.sub(r"\.csv$", "", out_path)
    write_csv(base + ".rejected.csv", ["姓名", "Email", "電話", "平台", "帳號名稱", "發票號碼", "剔除原因"],
              [[e.get("name", ""), e.get("email", ""), e.get("phone", ""), e.get("platform", ""),
                e.get("account", ""), e.get("invoice", ""), e.get("reject_reason", "")] for e in rejected])
    write_csv(base + ".dropped.csv", ["姓名", "Email", "電話", "平台", "帳號名稱", "發票號碼", "來源", "剔除原因"],
              [[e.get("name", ""), e.get("email", ""), e.get("phone", ""), e.get("platform", ""),
                e.get("account", ""), e.get("invoice", ""), e.get("source", ""), e.get("dedupe_note", "")] for e in dropped])

    print(f"線下表單 {len(form_entries)} 筆 → 有留言 {len(qualified)} 筆 / 剔除（沒留言）{len(rejected)} 筆")
    print(f"合併線上 {len(online_entries)} 筆 → 去重剔除 {len(dropped)} 筆 → 最終名單 {len(merged)} 筆")
    print("canonical:", out_path)
    print("rejected :", base + ".rejected.csv")
    print("dropped  :", base + ".dropped.csv")
    if draw_n:
        draw([e["entry_id"] for e in merged], seed, draw_n)
    return merged, rejected, dropped

# ---- 內建範例（--demo）-----------------------------------------------------
DEMO_FORM = """提交時間,姓名,Email,電話,消費金額,平台,帳號名稱,發票號碼,行銷同意,門市,來源
2026/11/01 14:03:22,王小美,mei@example.com,0912-345-678,1280,IG,luchinshu_fan,AB12345678,同意,誠品台茂店,offline-web
2026/11/02 18:41:05,陳大文,wen@example.com,+886923456789,560,FB,＠Chen_DaWen,CD-87654321,,誠品新竹巨城,offline-web
2026/11/03 20:15:47,李小華,hua@example.com,0933445566,980,IG,https://www.instagram.com/lihua_sweet/,AB22334455,同意,大江餐車,offline-web
2026/11/04 13:00:00,張沒留言,nocomment@example.com,0955667788,450,IG,no_comment_user,AB33445566,,誠品台茂店,offline-web
2026/11/04 19:20:11,劉重複,mei@example.com,0922334455,760,IG,dup_user,AB44556677,,大江餐車,offline-web"""

DEMO_FB = """帳號
chen_dawen
moonlight_baker"""

DEMO_IG = """帳號
luchinshu_fan
lihua_sweet
traveler_kiki
dup_user"""

DEMO_ONLINE = """時間戳記,抽獎人姓名,Email（用於通知中獎結果）,電話,消費金額,FB 或 IG（擇一）,FB 或 IG 名稱,訂單編號,個資同意（必填）,行銷訊息同意（選填）
2026/11/5 上午10:00:00,線上甲,mei@example.com,0912345678,2100,IG,online_me,ORD-10001,我已閱讀並同意,
2026/11/6 下午02:30:00,線上乙,sweet@example.com,0977889900,1450,IG,online_sweety,ORD-10002,我已閱讀並同意,我同意
2026/11/7 下午09:12:00,線上丙,Sweet@Example.com,0966554433,699,FB,online_chen,ORD-10003,我已閱讀並同意,"""

def demo(draw_n=None, seed=None):
    form = [{"name": r[1], "email": r[2], "phone": r[3], "amount": r[4], "platform": r[5],
             "account": r[6], "invoice": r[7], "marketing": r[8], "store": r[9], "ts": r[0],
             "source": "線下"} for r in list(csv.reader(io.StringIO(DEMO_FORM)))[1:]]
    fb = {norm_account(r[0]) for r in csv.reader(io.StringIO(DEMO_FB)) if r and r[0].strip()} - {"帳號"}
    ig = {norm_account(r[0]) for r in csv.reader(io.StringIO(DEMO_IG)) if r and r[0].strip()} - {"帳號"}
    on_rows = list(csv.reader(io.StringIO(DEMO_ONLINE)))
    online = [{"name": r[1], "email": r[2], "phone": r[3], "amount": r[4],
               "platform": "FB" if "FB" in r[5].upper() else "IG",
               "account": r[6], "invoice": "", "marketing": r[9], "store": "",
               "ts": r[0], "source": "線上"} for r in on_rows[1:]]
    os.makedirs("demo_output", exist_ok=True)
    run(form, {"FB": fb, "IG": ig}, online, os.path.join("demo_output", "canonical.csv"),
        draw_n=draw_n, seed=seed)

def main():
    ap = argparse.ArgumentParser(description="盧琴樹 雙11 抽獎名單合併（線下×留言×線上）")
    ap.add_argument("files", nargs="*", help="第一個是線下表單 CSV，其餘是留言名單 CSV/文字檔")
    ap.add_argument("--online", help="線上名單 CSV（Google 表單回覆，選用）")
    ap.add_argument("-o", "--output", default="canonical.csv", help="輸出 canonical CSV（預設 canonical.csv）")
    ap.add_argument("--platform", choices=["FB", "IG", "auto"], default="auto",
                    help="強制留言檔平台；預設依檔名偵測，偵測不到=auto 兩邊都比")
    ap.add_argument("--draw", type=int, metavar="N", help="抽籤：取 SHA-256(seed|id) 最小前 N 名")
    ap.add_argument("--seed", help="抽籤種子（公開，讓所有人可驗證）")
    ap.add_argument("--demo", action="store_true", help="用內建範例資料跑一遍")
    args = ap.parse_args()

    if args.demo:
        demo(args.draw, args.seed)
        return
    if len(args.files) < 2:
        ap.error("至少需要：線下表單 CSV + 一個留言名單檔（或改用 --demo）")
    if args.draw and not args.seed:
        ap.error("抽籤請一起給 --seed（公開種子，讓所有人可驗證結果）")

    form = load_form_csv(args.files[0], "線下")
    sets = {}
    for p in args.files[1:]:
        plat, accs = load_comments(p, None if args.platform == "auto" else args.platform)
        if plat == "auto":
            sets.setdefault("FB", set()).update(accs)
            sets.setdefault("IG", set()).update(accs)
            print(f"留言檔 {p}：平台 auto（兩邊皆列入）{len(accs)} 帳號")
        else:
            sets.setdefault(plat, set()).update(accs)
            print(f"留言檔 {p}：平台 {plat}，{len(accs)} 帳號")
    online = load_form_csv(args.online, "線上") if args.online else []
    run(form, sets, online, args.output, args.draw, args.seed)

if __name__ == "__main__":
    main()
