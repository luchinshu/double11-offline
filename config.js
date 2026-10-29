/**
 * 盧琴樹 LUCHINSHU（鷹速國際）雙11 線下門市掃碼抽獎 — 活動設定
 *
 * 以下數值都可被網址參數覆蓋（方便同一支程式給不同門市、不同貼文用）：
 *   ?fb=<FB 貼文網址>   覆蓋 FB_POST_URL
 *   ?ig=<IG 貼文網址>   覆蓋 IG_POST_URL
 *   ?store=<門市名稱>   覆蓋 STORE_NAME（會寫進提交資料與試算表）
 *   ?endpoint=<GAS 網址> 覆蓋 GAS_ENDPOINT（Google Apps Script Web App 網址）
 *   ?fbpage=<粉專網址> 覆蓋 FB_PAGE_URL
 *   ?igpage=<IG 主頁網址> 覆蓋 IG_PAGE_URL
 *
 * 範例：
 *   https://xxx.github.io/double11-offline/?store=誠品台茂店
 *     &fb=https://www.facebook.com/luchinshu/posts/123
 *     &ig=https://www.instagram.com/p/abc/
 *     &endpoint=https://script.google.com/macros/s/xxxx/exec
 */
window.LOTTERY_CONFIG = {
  FB_POST_URL: 'https://www.facebook.com/lcspastry/posts/pfbid029PC1KU1XuZk4cNcjRGEgMy14RkiEhHpfmee7R8U92p6eWt82DJ7Z4dTAfsrfEPJMl',
  IG_POST_URL: 'https://www.instagram.com/p/DejNTv3k-PQ/',
  DEFAULT_PLATFORM: 'FB',
  GAS_ENDPOINT: 'https://script.google.com/macros/s/AKfycbyNoTQRqz8wvZPSrRbEp6DwQsuL78DQ0LvFkWqZYcSlZpDxd1WJ-cMH5Gb5RgB-fnm56A/exec',
  STORE_NAME: '',
  FB_PAGE_URL: 'https://www.facebook.com/lcspastry',
  IG_PAGE_URL: 'https://www.instagram.com/luchinshu_/',
  FB_PAGE_LABEL: '盧琴樹粉專',
  IG_PAGE_LABEL: 'IG @luchinshu_'
};
