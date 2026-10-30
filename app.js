/* 盧琴樹 雙11 抽獎 — 先選線下門市或線上訂單，再填表 */
(function () {
  'use strict';
  var V = window.LotteryValidate;
  var LS_KEY = 'double11_offline_entries';

  // config.js 的設定可被網址參數 ?fb= ?ig= ?store= ?endpoint= ?channel= 覆蓋
  var cfg = V.resolveConfig(window.LOTTERY_CONFIG || {}, V.parseQueryString(window.location.search));

  var form = document.getElementById('lotteryForm');
  var submitBtn = document.getElementById('submitBtn');
  var formError = document.getElementById('formError');
  var formCard = document.getElementById('formCard');
  var successCard = document.getElementById('successCard');
  var countdownText = document.getElementById('countdownText');
  var goPostBtn = document.getElementById('goPostBtn');

  // 門市名稱（?store= 或 config）秀在頁首
  if (cfg.STORE_NAME) {
    var badge = document.getElementById('storeBadge');
    badge.textContent = '門市：' + cfg.STORE_NAME;
    badge.classList.add('on');
  }

  // 預設平台（config.DEFAULT_PLATFORM）
  var defaultP = (cfg.DEFAULT_PLATFORM || 'IG').toUpperCase();
  document.getElementById(defaultP === 'FB' ? 'pFB' : 'pIG').checked = true;

  var invoiceField = document.getElementById('invoiceField');
  var orderChannelField = document.getElementById('orderChannelField');
  var orderIdField = document.getElementById('orderIdField');
  var channelValue = document.getElementById('channelValue');

  function fieldValue(id) { return document.getElementById(id).value; }
  function checkedValue(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }
  function checkedPlatform() { return checkedValue('platform'); }
  function checkedChannel() {
    return channelValue ? V.resolveChannel({ channel: channelValue.value }) : '';
  }
  function checkedOrderChannel() {
    // 線上僅限官網；hidden input 或單一選項
    var el = form.querySelector('input[name="orderChannel"]:checked')
      || form.querySelector('input[name="orderChannel"]');
    return el ? el.value : '官網';
  }

  function syncChannel() {
    var ch = checkedChannel();
    if (invoiceField) invoiceField.hidden = ch !== 'store';
    if (orderChannelField) orderChannelField.hidden = ch !== 'online';
    if (orderIdField) orderIdField.hidden = ch !== 'online';
    var badge = document.getElementById('storeBadge');
    if (badge && cfg.STORE_NAME) {
      if (ch === 'online') badge.classList.remove('on');
      else badge.classList.add('on');
    }
  }

  function setChannel(ch) {
    if (channelValue) channelValue.value = (ch === 'online' || ch === 'store') ? ch : '';
    syncChannel();
  }

  function revealCampaign(ch, scrollToForm) {
    setChannel(ch);
    document.documentElement.classList.add('channel-open');
    if (!scrollToForm) return;
    var card = document.getElementById('formCard');
    if (!card || !card.scrollIntoView) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  // ?channel= 或 config 已決定管道時直接進表單，QR 深連結不用再點一次
  var preset = V.resolveChannel({ channel: cfg.CHANNEL || '' });
  if (preset === 'online' || preset === 'store') revealCampaign(preset, false);

  Array.prototype.forEach.call(document.querySelectorAll('.gate-btn'), function (btn) {
    btn.addEventListener('click', function () {
      var ch = V.resolveChannel({ channel: btn.getAttribute('data-channel') || '' });
      if (ch !== 'store' && ch !== 'online') return;
      revealCampaign(ch, true);
    });
  });

  function readForm() {
    return {
      channel: checkedChannel(),
      name: fieldValue('fName'),
      email: fieldValue('fEmail'),
      phone: fieldValue('fPhone'),
      amount: fieldValue('fAmount'),
      platform: checkedPlatform(),
      account: fieldValue('fAccount'),
      invoice: fieldValue('fInvoice'),
      orderId: fieldValue('fOrderId'),
      orderChannel: checkedOrderChannel(),
      privacyConsent: document.getElementById('fPrivacy').checked === true,
      marketing: document.getElementById('fMarketing').checked === true
    };
  }

  function clearErrors() {
    formError.classList.remove('on');
    formError.textContent = '';
    Array.prototype.forEach.call(document.querySelectorAll('.field-error'), function (el) {
      el.classList.remove('on');
      el.textContent = '';
    });
    Array.prototype.forEach.call(form.querySelectorAll('input.invalid'), function (el) {
      el.classList.remove('invalid');
    });
  }

  function showErrors(errors) {
    Object.keys(errors).forEach(function (key) {
      var el = document.querySelector('[data-err-for="' + key + '"]');
      if (el) { el.textContent = errors[key]; el.classList.add('on'); }
      var input = form.querySelector('[name="' + key + '"]');
      if (input && input.type !== 'radio' && input.type !== 'checkbox') input.classList.add('invalid');
    });
    formError.textContent = '有幾個欄位要再確認一下，修改後再送出一次就好囉！';
    formError.classList.add('on');
    var firstErr = document.querySelector('.field-error.on');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // 一律先存 localStorage（店機留底，admin.html 可下載）
  function saveLocal(entry) {
    var arr = [];
    try { arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    arr.push(entry);
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  }

  // text/plain 避免 preflight。cors 才讀得到 JSON；讀不到就不要假裝試算表已寫入。
  function gasSyncError(list, confirmed) {
    var err = new Error('gas');
    err.gasErrors = list || [];
    err.gasConfirmed = confirmed === true;
    return err;
  }
  function parseGasJson(text) {
    var t = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!t) return null;
    try { return JSON.parse(t); } catch (e) { return null; }
  }
  function sendToGas(entry) {
    if (!cfg.GAS_ENDPOINT) return Promise.reject(gasSyncError(['沒有設定試算表網址'], true));
    if (typeof fetch !== 'function') return Promise.reject(gasSyncError([], false));
    return fetch(cfg.GAS_ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(entry)
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = parseGasJson(text);
        if (data && data.ok === true) return data;
        var errors = [];
        if (data && Array.isArray(data.errors)) {
          data.errors.forEach(function (item) {
            if (typeof item === 'string' && item) errors.push(item);
          });
        }
        // 讀得到 JSON 且 ok 不是 true：試算表明確拒收。
        if (data && data.ok === false) throw gasSyncError(errors, true);
        throw gasSyncError([], false);
      });
    }).catch(function (err) {
      if (err && err.gasErrors) throw err;
      // CORS / 斷線：請求可能已送達，但這頁無法確認有沒有寫進試算表。
      throw gasSyncError([], false);
    });
  }

  function showSyncError(err) {
    var confirmed = err && err.gasConfirmed === true;
    var lines = confirmed
      ? ['名單同步失敗，請再送一次或截圖給小編']
      : ['名單可能尚未同步到試算表。本機已留底，請再送一次，或截圖給小編。'];
    ((err && err.gasErrors) || []).forEach(function (m) {
      if (lines.indexOf(m) === -1) lines.push(m);
    });
    formError.textContent = lines.join('\n');
    formError.classList.add('on');
    submitBtn.disabled = false;
    submitBtn.textContent = '送出，帶我去留言！';
    if (formError.scrollIntoView) formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function isRealPostUrl(url) {
    if (!url || !String(url).trim()) return false;
    var u = String(url).trim().toLowerCase();
    if (u.indexOf('example.com') !== -1) return false;
    if (u.indexOf('placeholder') !== -1) return false;
    return /^https?:\/\//i.test(u);
  }

  function showSuccess(platform) {
    var url = V.pickPostUrl(cfg, platform);
    formCard.style.display = 'none';
    document.querySelector('.warn-banner').style.display = 'none';
    successCard.classList.add('on');
    var followFb = document.getElementById('followFbBtn');
    var followIg = document.getElementById('followIgBtn');
    if (followFb) {
      followFb.href = cfg.FB_PAGE_URL || 'https://www.facebook.com/lcspastry';
      followFb.textContent = '追蹤 ' + (cfg.FB_PAGE_LABEL || 'FB 粉專');
    }
    if (followIg) {
      followIg.href = cfg.IG_PAGE_URL || 'https://www.instagram.com/luchinshu_/';
      followIg.textContent = '追蹤 ' + (cfg.IG_PAGE_LABEL || 'IG');
    }
    if (isRealPostUrl(url)) {
      goPostBtn.href = url;
      goPostBtn.style.display = '';
      goPostBtn.textContent = '馬上去貼文留言';
      var sec = 3;
      countdownText.style.display = '';
      countdownText.textContent = sec + ' 秒後自動帶你到貼文…';
      var timer = setInterval(function () {
        sec -= 1;
        if (sec <= 0) {
          clearInterval(timer);
          window.location.href = url;
        } else {
          countdownText.textContent = sec + ' 秒後自動帶你到貼文…';
        }
      }, 1000);
    } else {
      goPostBtn.removeAttribute('href');
      goPostBtn.style.display = 'none';
      countdownText.style.display = '';
      countdownText.textContent = '活動貼文還沒上線，先追蹤粉專／IG，貼文一發就能去留言！';
    }
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    clearErrors();
    var data = readForm();
    var result = V.validateForm(data);
    if (!result.ok) { showErrors(result.errors); return; }

    var isOnline = data.channel === 'online';
    var entry = {
      ts: new Date().toISOString(),
      name: data.name.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
      amount: Number(String(data.amount).replace(/,/g, '')),
      platform: data.platform,
      account: data.account.trim(),
      invoice: isOnline ? '' : data.invoice.trim(),
      orderId: isOnline ? data.orderId.trim() : '',
      orderChannel: isOnline ? (data.orderChannel || '官網') : '',
      channel: isOnline ? 'online' : 'store',
      privacyConsent: true,
      marketing: data.marketing === true,
      store: isOnline ? '' : (cfg.STORE_NAME || ''),
      source: isOnline ? 'online-web' : 'offline-web'
    };

    submitBtn.disabled = true;
    submitBtn.textContent = '送出中…';
    saveLocal(entry); // 本機留底；試算表沒寫入成功也不會當成登記完成
    sendToGas(entry).then(function () {
      showSuccess(entry.platform);
    }).catch(function (err) {
      showSyncError(err);
    });
  });
})();
