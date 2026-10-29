// 盧琴樹 雙11 線下抽獎 — 測試：node test.js
// 1) validate.js 的驗證／正規化／URL 解析
// 2) 與 merge.py 相同的比對合併邏輯（JS 版）
// 3) 整合測試：實際呼叫 python3 merge.py 跑 sample_data，檢查 canonical 結果
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const V = require('./validate.js');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('validate.js：發票 / Email / 電話');
t('發票格式通過 AB12345678 與 AB-12345678', () => {
  assert.ok(V.isValidInvoice('AB12345678'));
  assert.ok(V.isValidInvoice('ab-12345678'));
  assert.ok(!V.isValidInvoice('A12345678'));    // 少一碼英文
  assert.ok(!V.isValidInvoice('AB1234567'));    // 少一碼數字
  assert.ok(!V.isValidInvoice('AB123456789'));  // 多一碼
});
t('發票正規化去 dash 並轉大寫', () => {
  assert.strictEqual(V.normalizeInvoice('ab-87654321'), 'AB87654321');
});
t('Email 驗證與小寫正規化', () => {
  assert.ok(V.isValidEmail('a@b.co'));
  assert.ok(!V.isValidEmail('a@b'));
  assert.ok(!V.isValidEmail('not-an-email'));
  assert.strictEqual(V.normalizeEmail('  Sweet@Example.COM '), 'sweet@example.com');
});
t('電話驗證（8–15 字元，數字與 + - 空白括號，同 Google 表單規則）', () => {
  assert.ok(V.isValidPhone('0912-345-678'));
  assert.ok(V.isValidPhone('+886923456789'));
  assert.ok(!V.isValidPhone('123'));
  assert.ok(!V.isValidPhone('+886 912 345 678')); // 16 字元超過上限，Google 表單也會擋
});
t('電話正規化（886 規則，與試算表公式一致）', () => {
  assert.strictEqual(V.normalizePhone('0912-345-678'), '886912345678');
  assert.strictEqual(V.normalizePhone('+886 912 345 678'), '886912345678');
  assert.strictEqual(V.normalizePhone('912345678'), '886912345678'); // 9 碼補 886
});

console.log('validate.js：帳號正規化');
t('去 @、全形＠、空白、小寫', () => {
  assert.strictEqual(V.normalizeAccount('＠Chen_DaWen'), 'chen_dawen');
  assert.strictEqual(V.normalizeAccount('  @Luchinshu_Fan '), 'luchinshu_fan');
  assert.strictEqual(V.normalizeAccount('li hua sweet'), 'lihuasweet');
});
t('去 IG／FB 網址前綴與斜線', () => {
  assert.strictEqual(V.normalizeAccount('https://www.instagram.com/lihua_sweet/'), 'lihua_sweet');
  assert.strictEqual(V.normalizeAccount('http://m.facebook.com/ChenDaWen'), 'chendawen');
  assert.strictEqual(V.normalizeAccount('fb.com/someone'), 'someone');
});

console.log('validate.js：表單驗證');
const GOOD = {
  name: '王小美', email: 'mei@example.com', phone: '0912345678',
  amount: '1280', platform: 'IG', account: 'luchinshu_fan',
  channel: 'store', invoice: 'AB12345678', privacyConsent: true
};
const ONLINE = {
  name: '林小安', email: 'an@example.com', phone: '0988123456',
  amount: '1111', platform: 'FB', account: 'an_sweet',
  channel: 'online', orderId: 'sp-241029001', orderChannel: '蝦皮',
  privacyConsent: true
};
t('完整資料通過', () => assert.ok(V.validateForm(GOOD).ok));
t('缺個資同意不通過', () => {
  const r = V.validateForm(Object.assign({}, GOOD, { privacyConsent: false }));
  assert.ok(!r.ok && r.errors.privacyConsent);
});
t('平台只能 FB 或 IG', () => {
  assert.ok(!V.validateForm(Object.assign({}, GOOD, { platform: 'LINE' })).ok);
});
t('金額要大于 0 的數字', () => {
  assert.ok(!V.validateForm(Object.assign({}, GOOD, { amount: '0' })).ok);
  assert.ok(!V.validateForm(Object.assign({}, GOOD, { amount: 'abc' })).ok);
  assert.ok(V.validateForm(Object.assign({}, GOOD, { amount: '1,280' })).ok); // 可接受千分位
});

console.log('validate.js：線下門市 vs 線上訂單');
t('沒選通路不通過', () => {
  const r = V.validateForm(Object.assign({}, GOOD, { channel: '' }));
  assert.ok(!r.ok && r.errors.channel);
});
t('線下沒發票不通過', () => {
  const r = V.validateForm(Object.assign({}, GOOD, { invoice: '' }));
  assert.ok(!r.ok && r.errors.invoice && !r.errors.orderId);
});
t('線下不要求訂單編號', () => {
  assert.ok(V.validateForm(Object.assign({}, GOOD, { orderId: '', orderChannel: '' })).ok);
});
t('線上不需發票，有訂單編號與通路就通過', () => {
  const r = V.validateForm(ONLINE);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.ok(V.validateForm(Object.assign({}, ONLINE, { invoice: '' })).ok);
  assert.ok(V.validateForm(Object.assign({}, ONLINE, { invoice: '不是發票' })).ok);
});
t('線上沒訂單編號或不合法不通過', () => {
  assert.ok(!V.validateForm(Object.assign({}, ONLINE, { orderId: '  ' })).ok);
  assert.ok(!V.validateForm(Object.assign({}, ONLINE, { orderId: 'ABC' })).ok);       // 太短
  assert.ok(!V.validateForm(Object.assign({}, ONLINE, { orderId: 'ABCDEF' })).ok);   // 沒有數字
  const r = V.validateForm(Object.assign({}, ONLINE, { orderId: '' }));
  assert.ok(r.errors.orderId && !r.errors.invoice);
});
t('線上購買通路只接受官網／蝦皮／momo', () => {
  assert.ok(V.validateForm(Object.assign({}, ONLINE, { orderChannel: '官網' })).ok);
  assert.ok(V.validateForm(Object.assign({}, ONLINE, { orderChannel: 'momo' })).ok);
  assert.ok(V.validateForm(Object.assign({}, ONLINE, { orderChannel: 'MOMO' })).ok);
  assert.strictEqual(V.canonicalOrderChannel('MOMO'), 'momo');
  assert.ok(!V.validateForm(Object.assign({}, ONLINE, { orderChannel: 'PChome' })).ok);
  assert.ok(!V.validateForm(Object.assign({}, ONLINE, { orderChannel: '' })).ok);
});
t('訂單編號正規化 trim + 大寫', () => {
  assert.strictEqual(V.normalizeOrderId('  ab-12x '), 'AB-12X');
  assert.ok(V.isValidOrderId('AB-12'));
  assert.ok(V.isValidOrderId('2026103000123'));
  assert.ok(!V.isValidOrderId('ab'));
});
t('channel 別名 store／線上', () => {
  assert.strictEqual(V.resolveChannel({ channel: '線下門市' }), 'store');
  assert.strictEqual(V.resolveChannel({ channel: '線上訂單' }), 'online');
  assert.strictEqual(V.resolveChannel({ channelType: '門市' }), 'store');
  assert.strictEqual(V.resolveChannel({}), '');
});

console.log('validate.js：URL 參數與設定');
t('parseQueryString 解析與解碼', () => {
  const q = V.parseQueryString('?fb=https%3A%2F%2Fx.com%2Fa%3Fb%3D1&store=%E8%AA%A0%E5%93%81');
  assert.strictEqual(q.fb, 'https://x.com/a?b=1');
  assert.strictEqual(q.store, '誠品');
});
t('resolveConfig 只覆蓋有值的參數', () => {
  const base = { FB_POST_URL: 'A', IG_POST_URL: 'B', DEFAULT_PLATFORM: 'IG', GAS_ENDPOINT: '', STORE_NAME: '', CHANNEL: '' };
  const cfg = V.resolveConfig(base, { fb: 'X', store: '台茂', endpoint: ' ', channel: 'online' });
  assert.strictEqual(cfg.FB_POST_URL, 'X');
  assert.strictEqual(cfg.IG_POST_URL, 'B');       // 沒給就不動
  assert.strictEqual(cfg.STORE_NAME, '台茂');
  assert.strictEqual(cfg.GAS_ENDPOINT, '');       // 空白不覆蓋
  assert.strictEqual(cfg.CHANNEL, 'online');
});
t('pickPostUrl 依平台挑貼文', () => {
  const cfg = { FB_POST_URL: 'F', IG_POST_URL: 'I' };
  assert.strictEqual(V.pickPostUrl(cfg, 'FB'), 'F');
  assert.strictEqual(V.pickPostUrl(cfg, 'IG'), 'I');
});

console.log('validate.js：CSV');
t('parseCsv 支援引號、跳脫、CRLF、BOM', () => {
  const rows = V.parseCsv('﻿a,b\r\n"x,""y""",z\r\n1,2\n');
  assert.deepStrictEqual(rows[0], ['a', 'b']);
  assert.deepStrictEqual(rows[1], ['x,"y"', 'z']);
  assert.strictEqual(rows.length, 3);
});
t('toCsv 會引號跳脫', () => {
  const s = V.toCsv([['a,b', 'c"d', 'e']]);
  assert.ok(s.indexOf('"a,b","c""d",e') === 0);
});

console.log('比對合併邏輯（與 merge.py 同一套規則）');
const FORM = [
  { name: '王小美', email: 'mei@example.com', phone: '0912-345-678', platform: 'IG', account: 'luchinshu_fan', invoice: 'AB12345678' },
  { name: '陳大文', email: 'wen@example.com', phone: '+886923456789', platform: 'FB', account: '＠Chen_DaWen', invoice: 'CD-87654321' },
  { name: '張沒留言', email: 'no@example.com', phone: '0955667788', platform: 'IG', account: 'no_comment_user', invoice: 'AB33445566' },
  { name: '劉重複', email: 'MEI@example.com', phone: '0922334455', platform: 'IG', account: 'dup_user', invoice: 'AB44556677' }
];
const FB_SET = ['chen_dawen', 'moonlight_baker'];
const IG_SET = ['luchinshu_fan', 'dup_user'];
t('只留有表單且有留言；跨平台留言也算（聯集比對）', () => {
  const m = V.matchOfflineWithComments(FORM, { FB: FB_SET, IG: IG_SET });
  assert.strictEqual(m.qualified.length, 3);      // 王小美、陳大文（在 FB 名單）、劉重複
  assert.strictEqual(m.rejected.length, 1);       // 張沒留言
  const chen = m.qualified.find(e => e.name === '陳大文');
  assert.strictEqual(chen.matchedPlatform, 'FB'); // 填 FB、在 FB 留言
  assert.strictEqual(chen.entryId, 'FB:chen_dawen');
});
t('帳號正規化後比對（@、大小寫、網址前綴）', () => {
  assert.strictEqual(V.normalizeAccount(FORM[1].account), 'chen_DaWen'.toLowerCase());
  assert.strictEqual(V.normalizeAccount('https://www.instagram.com/lihua_sweet/'), 'lihua_sweet');
});
t('合併去重：Email 大小寫、電話 886、先出現優先', () => {
  const online = [
    { name: '線上甲', email: 'mei@example.com', phone: '0912345678', platform: 'IG', account: 'online_me', invoice: '' },
    { name: '線上乙', email: 'sweet@example.com', phone: '0977889900', platform: 'IG', account: 'online_sweety', invoice: '' }
  ];
  const m = V.matchOfflineWithComments(FORM, { FB: FB_SET, IG: IG_SET });
  const r = V.dedupeMerge([{ source: '線下', entries: m.qualified }, { source: '線上', entries: online }]);
  // 線下合格 3 人（王、陳、劉），劉撞王的 Email；線上甲撞王的電話 → 留 王、陳、線上乙 共 3 筆
  assert.strictEqual(r.merged.length, 3);
  assert.strictEqual(r.dropped.length, 2);
  const notes = r.dropped.map(e => e.dedupeNote).join('|');
  assert.ok(notes.indexOf('Email') >= 0 && notes.indexOf('電話') >= 0);
});
t('訂單編號去重：trim + 大寫，空白訂單不當成同一筆', () => {
  const a = { name: '甲', email: 'a@ex.com', phone: '0911000111', platform: 'IG', account: 'a_user', invoice: '', orderId: ' ab12 ' };
  const b = { name: '乙', email: 'b@ex.com', phone: '0922000222', platform: 'IG', account: 'b_user', invoice: '', orderId: 'AB12' };
  const c = { name: '丙', email: 'c@ex.com', phone: '0933000333', platform: 'IG', account: 'c_user', invoice: 'XY12345678', orderId: '' };
  const d = { name: '丁', email: 'd@ex.com', phone: '0944000444', platform: 'IG', account: 'd_user', invoice: '', orderId: '' };
  const r = V.dedupeMerge([
    { source: '線上', entries: [a] },
    { source: '線上', entries: [b, d] },
    { source: '線下', entries: [c] }
  ]);
  assert.strictEqual(r.merged.length, 3);
  assert.strictEqual(r.dropped.length, 1);
  assert.ok(r.dropped[0].dedupeNote.indexOf('訂單') >= 0);
});

console.log('抽籤（verify.py 風格）');
t('list_hash 與排序與 Python 一致', () => {
  // 與 python3 merge.py --demo 輸出比對過的固定值
  const ids = ['FB:chen_dawen', 'IG:lihua_sweet', 'IG:luchinshu_fan', 'IG:online_sweety'];
  const r = V.rankDraw(ids, 'demo-seed');
  assert.strictEqual(r.listHash, '488c25335fb5026a1f2f6122223ee7209848d93a992b8ba2feb82527336d9d04');
  assert.strictEqual(r.ranked[0].id, 'IG:online_sweety');
  assert.strictEqual(r.ranked[0].hash, '01e294a8fb52c630e2d97b309688873cf66c250ae7d78ae526f8fe0a517a12fa');
});

console.log('整合：python3 merge.py 跑 sample_data');
t('canonical 名單 4 筆、rejected 1 筆、dropped 3 筆', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-test-'));
  const out = path.join(tmp, 'canonical.csv');
  execFileSync('python3', [
    'merge.py', 'sample_data/offline_form.csv',
    'sample_data/fb_comments.csv', 'sample_data/ig_comments.csv',
    '--online', 'sample_data/online_form.csv',
    '-o', out, '--draw', '2', '--seed', 'testseed'
  ], { cwd: __dirname, encoding: 'utf8' });
  const canon = fs.readFileSync(out, 'utf8');
  const dataRows = V.parseCsv(canon).slice(1);
  assert.strictEqual(dataRows.length, 4);
  const ids = dataRows.map(r => r[0]).sort();
  assert.deepStrictEqual(ids, ['FB:chen_dawen', 'IG:lihua_sweet', 'IG:luchinshu_fan', 'IG:online_sweety']);
  assert.ok(fs.readFileSync(out.replace(/\.csv$/, '.rejected.csv'), 'utf8').includes('張沒留言'));
  assert.ok(fs.readFileSync(out.replace(/\.csv$/, '.dropped.csv'), 'utf8').includes('劉重複'));
});
t('--draw 沒給 --seed 要報錯', () => {
  let threw = false;
  try {
    execFileSync('python3', ['merge.py', 'a.csv', 'b.csv', '--draw', '1'],
      { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { threw = true; }
  assert.ok(threw);
});

console.log('Code.gs：伺服器驗證（與表單同一套，不連試算表）');
const vm = require('vm');
const gas = {};
vm.createContext(gas);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), gas);
const basePerson = {
  name: '王小美', email: 'mei@example.com', phone: '0912345678',
  amount: '1280', platform: 'IG', account: 'luchinshu_fan', privacyConsent: true
};
function gasErrors(list) { return Array.from(list); }
t('門市有發票通過；沒發票失敗', () => {
  const ok = gasErrors(gas.validate_(Object.assign({}, basePerson, { channel: 'store', invoice: 'AB12345678', source: 'offline-web' })));
  assert.deepStrictEqual(ok, []);
  const bad = gasErrors(gas.validate_(Object.assign({}, basePerson, { channel: 'store', invoice: '', source: 'offline-web' })));
  assert.ok(bad.some(e => e.indexOf('發票') >= 0));
});
t('線上不需發票；要訂單編號與官網／蝦皮／momo', () => {
  const ok = gasErrors(gas.validate_(Object.assign({}, basePerson, {
    channel: 'online', source: 'online-web', invoice: '',
    orderId: 'sp-241029001', orderChannel: '蝦皮'
  })));
  assert.deepStrictEqual(ok, []);
  ['官網', 'momo', 'MOMO'].forEach(ch => {
    const r = gasErrors(gas.validate_(Object.assign({}, basePerson, {
      channel: 'online', orderId: '202610300099', orderChannel: ch
    })));
    assert.deepStrictEqual(r, [], ch);
  });
  const noInvRequired = gasErrors(gas.validate_(Object.assign({}, basePerson, {
    channel: 'online', orderId: 'momo99887766', orderChannel: 'momo', invoice: ''
  })));
  assert.deepStrictEqual(noInvRequired, []);
  const missing = gasErrors(gas.validate_(Object.assign({}, basePerson, {
    channel: 'online', orderId: '', orderChannel: '', invoice: ''
  })));
  assert.ok(missing.some(e => e.indexOf('訂單') >= 0));
  assert.ok(missing.some(e => e.indexOf('通路') >= 0));
  assert.ok(!missing.some(e => e.indexOf('發票') >= 0));
});
t('舊版只送發票、source=offline-web 仍當門市', () => {
  assert.strictEqual(gas.channelOf_({ invoice: 'AB-12345678', source: 'offline-web' }), 'store');
  const ok = gasErrors(gas.validate_(Object.assign({}, basePerson, { invoice: 'AB-12345678', source: 'offline-web' })));
  assert.deepStrictEqual(ok, []);
});
t('訂單編號比對用 trim + 大寫', () => {
  assert.strictEqual(gas.normOrderId_('  ab12 '), 'AB12');
  assert.strictEqual(gas.canonicalOrderChannel_('MOMO'), 'momo');
});
t('寫入列：線上發票留白、門市訂單編號留白，新欄接在舊表頭後面', () => {
  const old = ['提交時間', '姓名', 'Email', '電話', '消費金額', '平台', '帳號名稱', '發票號碼', '行銷同意', '門市', '來源', '重複標記'];
  const merged = Array.from(gas.mergeHeaders_(old));
  assert.strictEqual(merged[7], '發票號碼');
  assert.strictEqual(merged[11], '重複標記');
  assert.deepStrictEqual(merged.slice(12), ['通路類型', '購買通路', '訂單編號']);
  function idxOf(names) {
    const idx = {};
    names.forEach((n, i) => { idx[n] = i; });
    return idx;
  }
  const online = Array.from(gas.buildRow_(merged, idxOf(merged), Object.assign({}, basePerson, {
    channel: 'online', source: 'online-web', invoice: 'AB12345678',
    orderId: ' sp-99 ', orderChannel: 'MOMO', store: '不該寫入'
  }), 'online', ''));
  assert.strictEqual(online[7], '');
  assert.strictEqual(online[idxOf(merged)['訂單編號']], 'sp-99');
  assert.strictEqual(online[idxOf(merged)['購買通路']], 'momo');
  assert.strictEqual(online[idxOf(merged)['通路類型']], '線上');
  assert.strictEqual(online[idxOf(merged)['來源']], 'online-web');
  assert.strictEqual(online[idxOf(merged)['門市']], '');
  const store = Array.from(gas.buildRow_(merged, idxOf(merged), Object.assign({}, basePerson, {
    channel: 'store', source: 'offline-web', invoice: 'AB12345678',
    orderId: 'SHOULD-NOT', orderChannel: '蝦皮', store: '誠品台茂店'
  }), 'store', ''));
  assert.strictEqual(store[7], 'AB12345678');
  assert.strictEqual(store[idxOf(merged)['訂單編號']], '');
  assert.strictEqual(store[idxOf(merged)['購買通路']], '');
  assert.strictEqual(store[idxOf(merged)['通路類型']], '門市');
  assert.strictEqual(store[idxOf(merged)['門市']], '誠品台茂店');
});

console.log(process.exitCode ? '\n有測試失敗' : '\n全部 ' + passed + ' 項測試通過 ✓');
