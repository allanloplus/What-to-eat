// 執行：node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/data.js');
require('../js/engine.js');
require('../js/services.js');
const { DATA: D, engine: E, svc: S } = globalThis.WTE;

// 2026-10-18 19:40（台灣時間），當天是重陽節
const NOW = new Date('2026-10-18T11:40:00Z');
const base = (over) => Object.assign({
  county: 'TNN', slot: 'd', weather: { temp: 'cool', rain: true }, mood: 'sad', solo: true,
  companions: [], size: 1, budget: 2, diets: [], history: [], now: NOW, seed: 1,
}, over);

test('知識庫：22 縣市、id 不重複、欄位合法', () => {
  assert.equal(D.COUNTIES.length, 22);
  const ids = new Set();
  const known = new Set(Object.keys(D.TAG_LABELS).concat(['veg', 'vegok', 'local', 'p1', 'p2', 'p3']));
  for (const f of D.FOODS) {
    assert.ok(!ids.has(f.id), '重複 id ' + f.id);
    ids.add(f.id);
    assert.ok(f.slots.length && f.slots.every((s) => 'bltdn'.includes(s)), f.id + ' 時段');
    assert.ok(D.CAT_LABELS[f.cat], f.id + ' 類別 ' + f.cat);
    for (const t of f.tags) assert.ok(known.has(t), f.id + ' 未知標籤 ' + t);
    assert.ok(f.kw && f.desc, f.id + ' 關鍵字或介紹');
  }
  for (const c of D.COUNTIES) {
    assert.ok(c.foods.length >= 5, c.name + ' 在地美食太少');
    assert.ok(c.anchors.length >= 4, c.name + ' 參考點太少');
  }
});

test('時段判斷', () => {
  assert.equal(E.slotFor(4 * 60 + 59), 'n');
  assert.equal(E.slotFor(5 * 60), 'b');
  assert.equal(E.slotFor(10 * 60 + 30), 'l');
  assert.equal(E.slotFor(14 * 60), 't');
  assert.equal(E.slotFor(17 * 60), 'd');
  assert.equal(E.slotFor(21 * 60), 'n');
  assert.equal(E.slotFor(23 * 60 + 59), 'n');
});

test('台灣時間與節日', () => {
  const t = E.taipeiNow(NOW);
  assert.equal(t.date, '2026-10-18');
  assert.equal(t.hh, 19);
  assert.deepEqual(E.activeFestivals(t).map((f) => f.name), ['重陽節']);
  const before = E.activeFestivals(E.taipeiNow(new Date('2026-11-05T04:00:00Z')));
  assert.equal(before[0].name, '立冬');
  assert.equal(before[0].inDays, 2);
  assert.equal(E.activeFestivals(E.taipeiNow(new Date('2026-10-25T04:00:00Z'))).length, 0);
  assert.equal(E.activeFestivals(E.taipeiNow(new Date('2027-10-30T04:00:00Z')))[0].name, '萬聖節');
});

test('座標判斷縣市', () => {
  const cases = [
    [25.0418, 121.5440, 'TPE'], [22.9917, 120.2047, 'TNN'], [24.1477, 120.6736, 'TXG'],
    [23.9871, 121.6015, 'HUA'], [22.6273, 120.3014, 'KHH'], [24.4493, 118.3767, 'KIN'],
    [23.5711, 119.5793, 'PEN'], [25.1276, 121.7392, 'KEE'], [24.7570, 121.7536, 'ILA'],
  ];
  for (const [lat, lon, id] of cases) assert.equal(E.detectCounty(lat, lon).county.id, id, lat + ',' + lon);
  assert.equal(E.detectCounty(35.68, 139.76), null);
});

test('天氣分類', () => {
  assert.deepEqual(E.classifyWeather({ apparent_temperature: 34, weather_code: 1, precipitation: 0, wind_speed_10m: 5 }), { temp: 'scorch', rain: false, storm: false });
  assert.deepEqual(E.classifyWeather({ apparent_temperature: 14, weather_code: 63, precipitation: 3, wind_speed_10m: 62 }), { temp: 'cold', rain: true, storm: true });
  assert.equal(E.classifyWeather({ temperature_2m: 20, weather_code: 3 }).temp, 'cool');
});

test('推薦遵守時段、縣市與忌口', () => {
  const veg = E.recommend(base({ diets: ['veg', 'nobeef'] }));
  assert.ok(veg.ranked.length > 0);
  for (const r of veg.ranked) {
    assert.ok(r.food.slots.includes('d'));
    assert.ok(!r.food.county || r.food.county === 'TNN');
    assert.ok(r.food.tags.includes('veg') || r.food.tags.includes('vegok'), r.food.name);
    assert.ok(!r.food.tags.includes('beef'), r.food.name);
  }
  const nospicy = E.recommend(base({ diets: ['nospicy', 'noseafood'] }));
  for (const r of nospicy.ranked) {
    assert.ok(!r.food.tags.includes('spicy') && !r.food.tags.includes('seafood'), r.food.name);
  }
});

test('前六名：同類型最多兩道、盡量保留兩道在地美食', () => {
  const res = E.recommend(base({ county: 'TPE', mood: 'joy', solo: false, companions: ['friends'], size: 6, budget: 3 }));
  assert.equal(res.picks.length, 6);
  const perCat = {};
  res.picks.forEach((p) => { perCat[p.food.cat] = (perCat[p.food.cat] || 0) + 1; });
  // 在地補位可能讓某類別多一道，但不會超過三道
  Object.values(perCat).forEach((n) => assert.ok(n <= 3));
  const locals = res.ranked.filter((r) => r.food.county);
  const picked = res.picks.filter((p) => p.food.county);
  assert.ok(picked.length >= 1);
  // 第二道在地美食只要分數不比第一名低超過 60 就要入選
  if (locals[1] && locals[1].score >= res.picks[0].score - 60) assert.ok(picked.length >= 2);
  for (let i = 1; i < res.picks.length; i++) assert.ok(res.picks[i - 1].score >= res.picks[i].score);
});

test('天氣與心情會改變結果', () => {
  const hot = E.recommend(base({ slot: 't', weather: { temp: 'scorch' }, mood: 'busy', county: 'KHH' }));
  assert.ok(hot.picks.slice(0, 3).some((p) => p.food.tags.includes('cold') || p.food.tags.includes('ice')));
  const storm = E.recommend(base({ weather: { temp: 'cool', rain: true, storm: true }, mood: 'tired', county: 'NTP' }));
  assert.ok(storm.picks[0].food.tags.includes('delivery'), storm.picks[0].food.name);
  assert.ok(!storm.picks.some((p) => p.food.tags.includes('nightmarket')));
});

test('最近吃過的會被扣分', () => {
  const first = E.recommend(base());
  const top = first.picks[0].food;
  const again = E.recommend(base({ history: [{ id: top.id, cat: top.cat, ts: NOW.getTime() - 3600e3 }] }));
  const item = again.ranked.find((r) => r.food.id === top.id);
  assert.ok(item.parts.some((p) => p.src === 'history' && p.delta === -30));
});

test('推薦理由與稽核報告', () => {
  const st = base({ budget: 1 });
  const res = E.recommend(st);
  const item = res.ranked.find((r) => E.priceOf(r.food) === 3) || res.picks[0];
  const groups = E.explain(item, st, res.ctx);
  assert.ok(groups.length > 0 && groups.every((g) => g.delta !== 0));
  const a = E.audit(item, st, res.ctx, { located: false });
  assert.deepEqual(a.rows.map((r) => r.clause), ['4.1', '4.2', '6.1', '7.1', '9.1', 'A.5.34']);
  if (E.priceOf(item.food) > 1) assert.equal(a.rows[3].verdict, '觀察事項');
  assert.match(E.narrate(res.picks[0], st, res.ctx), /阿拉蕾推薦你吃「/);
});

test('Overpass 查詢：座標模糊到小數三位、關鍵字會跳脫', () => {
  const foods = E.recommend(base()).picks.map((p) => p.food);
  const q = S.buildQuery(foods, 22.991734, 120.204712, 800);
  assert.match(q, /around:800,22\.992,120\.205/);
  assert.ok(!/22\.9917/.test(q));
  assert.match(q, /out center tags 300;/);
  const fake = { name: '測試', kw: 'A+B|7-ELEVEN', cuisine: '' };
  assert.match(S.buildQuery([fake], 25, 121, 500), /A\\\\\+B\|7-ELEVEN/);
  assert.equal(S.classify({ tags: { name: '巷口 7-ELEVEN 門市' } }, [fake]), 0);
  assert.equal(S.classify({ tags: { name: '別的店' } }, [fake]), -1);
});

test('鄉鎮資料：每個 town 都有座標，而且落在所屬縣市', () => {
  for (const f of D.FOODS.filter((x) => x.town)) {
    const t = D.TOWNS[f.town];
    assert.ok(t, f.id + ' 的鄉鎮「' + f.town + '」沒有座標');
    assert.equal(E.detectCounty(t[0], t[1]).county.id, f.county, f.id + ' 的鄉鎮不在 ' + f.county);
  }
});

test('口袋名店與代表性美食', () => {
  for (const f of D.FOODS.filter((x) => x.shops)) {
    for (const shop of f.shops) {
      assert.ok(shop.name, f.id + ' 名店缺店名');
      assert.match(shop.url, /^https:\/\/maps\.app\.goo\.gl\/\w+$/, f.id + ' 名店連結');
    }
  }
  const kin = D.COUNTIES.find((c) => c.id === 'KIN').foods.map((f) => f.name);
  for (const name of ['高坑牛肉麵', '高坑牛肉乾', '金門炒泡麵', '廣東粥', '金門海產熱炒']) assert.ok(kin.includes(name), '金門缺 ' + name);
  const shops = D.FOODS.filter((f) => f.county === 'KIN' && f.shops).flatMap((f) => f.shops.map((x) => x.name));
  assert.equal(shops.length, 10);
  assert.ok(D.FOODS.some((f) => f.id === 'CHA:溪湖羊肉爐' && f.town === '溪湖'));
  for (const c of D.COUNTIES) assert.ok(c.foods.length >= 9, c.name + ' 只有 ' + c.foods.length + ' 道');
});

test('GPS 在名產鄉鎮附近會加分，遠的不會', () => {
  const near = E.recommend(base({ county: 'CHA', near: { lat: 23.96, lon: 120.48 }, weather: { temp: 'cold' }, mood: 'calm', solo: false, companions: ['friends'], size: 4 }));
  const yang = near.ranked.find((r) => r.food.name === '溪湖羊肉爐');
  assert.ok(yang.parts.some((p) => p.src === 'near:溪湖' && p.delta === 12));
  assert.equal(near.picks[0].food.name, '溪湖羊肉爐');
  assert.match(E.narrate(near.picks[0], base({ county: 'CHA' }), near.ctx), /你就在溪湖附近/);
  const far = E.recommend(base({ county: 'CHA', near: { lat: 24.08, lon: 120.54 } }));
  assert.ok(!far.ranked.find((r) => r.food.name === '溪湖羊肉爐').parts.some((p) => p.tag === 'near'));
});

test('前六名不會出現同一種菜兩次', () => {
  for (const county of ['TPE', 'TYN', 'HSZ', 'HSQ', 'KIN', 'CHA']) {
    for (const slot of ['l', 'd', 't']) {
      const res = E.recommend(base({ county, slot, mood: 'calm' }));
      const keys = res.picks.map((p) => p.food.kw.split('|')[0]);
      assert.equal(new Set(keys).size, keys.length, county + slot + ' ' + keys.join(','));
    }
  }
});

test('口袋名店的店名也拿來比對 OpenStreetMap', () => {
  const food = D.FOODS.find((f) => f.name === '金門海產熱炒');
  assert.equal(S.classify({ tags: { name: '信源海產店' } }, [food]), 0);
  assert.match(S.buildQuery([food], 24.43, 118.32, 3000), /信源海產店/);
  assert.ok(!/金城分店/.test(S.buildQuery([food], 24.43, 118.32, 3000)));
});

test('飯友「老同學」偏好有回憶的經典老味道', () => {
  const c = D.COMPANIONS.find((x) => x.id === 'classmate');
  assert.equal(c.label, '老同學');
  const res = E.recommend(base({ county: 'TNN', solo: false, companions: ['classmate'], size: 5, mood: 'calm' }));
  const top = res.picks[0];
  assert.ok(top.parts.some((p) => p.src === 'company' && p.delta > 0));
  assert.match(E.narrate(top, base({ solo: false, companions: ['classmate'], size: 5 }), res.ctx), /老同學/);
});

test('只推在地代表性美食，沒有時退回全部並註明', () => {
  const res = E.recommend(base({ county: 'KIN', slot: 'l', localOnly: true }));
  assert.ok(res.ctx.localOnly);
  assert.equal(res.picks.length, 6);
  assert.ok(res.ranked.every((r) => r.food.county === 'KIN'));
  // 新竹市沒有消夜時段的在地美食
  const none = E.recommend(base({ county: 'HSZ', slot: 'n', localOnly: true }));
  assert.ok(none.ctx.localFallback && !none.ctx.localOnly);
  assert.ok(none.picks.length > 0);
  assert.match(E.narrate(none.picks[0], base({ county: 'HSZ', slot: 'n' }), none.ctx), /代表性美食都還沒開賣/);
  // 沒選縣市時忽略這個選項
  const noCounty = E.recommend(base({ county: null, localOnly: true }));
  assert.ok(!noCounty.ctx.localOnly && noCounty.picks.length > 0);
});
