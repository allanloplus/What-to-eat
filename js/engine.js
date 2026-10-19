/*
 * 阿拉蕾推薦引擎：把地點、天氣、時段、心情、飯友、預算與忌口換算成每道菜的分數，
 * 並保留每一筆加減分的來源，讓推薦理由和「稽核報告」都能逐條說明。
 */
(function (root) {
  'use strict';
  var D = root.WTE.DATA;

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // ---------- 時間（一律用台灣時間） ----------
  function taipeiNow(date) {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date || new Date());
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    var hh = Number(o.hour) % 24;
    return {
      y: Number(o.year), m: Number(o.month), d: Number(o.day), hh: hh, mm: Number(o.minute),
      date: o.year + '-' + o.month + '-' + o.day,
      md: o.month + '-' + o.day,
      minutes: hh * 60 + Number(o.minute),
    };
  }

  function slotFor(minutes) {
    var slot = 'n';
    for (var i = 0; i < D.SLOTS.length; i++) if (minutes >= D.SLOTS[i].from) slot = D.SLOTS[i].id;
    return minutes < D.SLOTS[0].from ? 'n' : slot;
  }

  // ---------- 天氣 ----------
  // Open-Meteo 的 current 欄位 → { temp, rain, storm }
  function classifyWeather(cur) {
    var t = cur.apparent_temperature != null ? cur.apparent_temperature : cur.temperature_2m;
    var code = cur.weather_code || 0;
    var rainy = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 || (cur.precipitation || 0) >= 0.2;
    var temp = t >= 32 ? 'scorch' : t >= 28 ? 'hot' : t >= 22 ? 'nice' : t >= 16 ? 'cool' : 'cold';
    return { temp: temp, rain: rainy, storm: rainy && (cur.wind_speed_10m || 0) >= 50 };
  }

  function weatherIds(w) {
    if (!w) return [];
    var ids = [w.temp];
    if (w.storm) ids.push('storm');
    else if (w.rain) ids.push('rain');
    return ids.filter(Boolean);
  }

  function describeWeatherCode(code) {
    if (code === 0) return '晴朗';
    if (code <= 2) return '晴時多雲';
    if (code === 3) return '陰天';
    if (code === 45 || code === 48) return '有霧';
    if (code >= 51 && code <= 57) return '毛毛雨';
    if (code >= 61 && code <= 67) return '下雨';
    if (code >= 71 && code <= 77) return '下雪';
    if (code >= 80 && code <= 82) return '陣雨';
    if (code >= 95) return '雷雨';
    return '多雲';
  }

  // ---------- 節日 ----------
  function daysBetween(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }

  // 今天或兩天內到來的節日
  function activeFestivals(now) {
    var out = [];
    D.FESTIVALS.forEach(function (fest) {
      fest.dates.forEach(function (d) {
        var full = d.length === 5 ? now.y + '-' + d : d;
        var diff = daysBetween(now.date, full);
        if (diff >= 0 && diff <= 2 && out.indexOf(fest) < 0) {
          out.push(Object.assign({ inDays: diff }, fest));
        }
      });
    });
    return out;
  }

  // ---------- 位置 → 縣市 ----------
  function haversine(a, b) {
    var R = 6371000;
    var toRad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * toRad;
    var dLon = (b[1] - a[1]) * toRad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // 以各縣市參考點找最近者；離最近參考點超過 60 公里就當作不在台灣
  function detectCounty(lat, lon) {
    var best = null;
    var bestD = Infinity;
    D.COUNTIES.forEach(function (c) {
      c.anchors.forEach(function (p) {
        var d = haversine([lat, lon], p);
        if (d < bestD) { bestD = d; best = c; }
      });
    });
    return bestD <= 60000 ? { county: best, meters: bestD } : null;
  }

  // ---------- 亂數（可重現） ----------
  function hashSeed(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rand01(str) {
    var t = hashSeed(str) + 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function firstKeyword(food) {
    return food.kw.split('|')[0];
  }

  function priceOf(food) {
    if (food.tags.indexOf('p3') >= 0) return 3;
    if (food.tags.indexOf('p1') >= 0) return 1;
    return 2;
  }

  // ---------- 評分 ----------
  function eligible(food, st, month) {
    if (food.slots.indexOf(st.slot) < 0) return false;
    if (food.county && food.county !== st.county) return false;
    if (food.months && food.months.indexOf(month) < 0) return false;
    var t = food.tags;
    var diets = st.diets || [];
    if (diets.indexOf('veg') >= 0 && t.indexOf('veg') < 0 && t.indexOf('vegok') < 0) return false;
    if (diets.indexOf('nospicy') >= 0 && t.indexOf('spicy') >= 0) return false;
    if (diets.indexOf('nobeef') >= 0 && t.indexOf('beef') >= 0) return false;
    if (diets.indexOf('noseafood') >= 0 && t.indexOf('seafood') >= 0) return false;
    return true;
  }

  function scoreFood(food, st, ctx) {
    var tags = food.tags.concat([food.cat]);
    var parts = [];
    function add(src, tag, delta) {
      if (delta) parts.push({ src: src, tag: tag, delta: delta });
    }
    function applyWeights(src, w) {
      Object.keys(w).forEach(function (tag) {
        if (tags.indexOf(tag) >= 0) add(src, tag, w[tag]);
      });
    }

    if (food.county) add('local', 'local', 22);
    if (food.months) add('season', 'season', 10);
    if (food.shops) add('shops', 'shops', 5);
    // 有 GPS 時，名產所在的鄉鎮就在 8 公里內再加分
    if (st.near && food.town && D.TOWNS[food.town] &&
      haversine([st.near.lat, st.near.lon], D.TOWNS[food.town]) <= 8000) {
      add('near:' + food.town, 'near', 12);
    }

    ctx.weather.forEach(function (w) { applyWeights('weather:' + w.id, w.w); });
    if (ctx.mood) applyWeights('mood', ctx.mood.w);

    if (st.solo) {
      applyWeights('company', D.SOLO.w);
    } else {
      ctx.companions.forEach(function (c) { applyWeights('company', c.w); });
      var n = st.size || 2;
      if (n >= 6) applyWeights('size', { group: 12, share: 6, solo: -15 });
      else if (n >= 3) applyWeights('size', { group: 6, share: 4 });
    }

    var diff = priceOf(food) - (st.budget || 2);
    add('budget', 'price', diff === 0 ? 6 : diff === 1 ? -10 : diff >= 2 ? -25 : diff === -2 ? -4 : 0);

    var diets = st.diets || [];
    if (diets.indexOf('light') >= 0) applyWeights('diet', { healthy: 14, light: 10, fried: -15, heavy: -15 });
    if (diets.indexOf('veg') >= 0) applyWeights('diet', { veg: 8 });

    (st.history || []).forEach(function (h) {
      var age = (ctx.nowMs - h.ts) / 86400000;
      if (h.id === food.id) {
        if (age <= 3) add('history', 'same', -30);
        else if (age <= 7) add('history', 'same', -12);
      } else if (h.cat === food.cat && age <= 2) {
        add('history', 'cat', -6);
      }
    });

    ctx.festivals.forEach(function (fest) {
      if (fest.boost.indexOf(food.name) >= 0) add('festival:' + fest.name, 'festival', 30);
      applyWeights('festival:' + fest.name, fest.w);
    });

    add('luck', 'luck', Math.round(rand01((st.seed || 0) + '|' + food.id) * 8));

    var score = 20;
    parts.forEach(function (p) { score += p.delta; });
    return { food: food, score: score, parts: parts };
  }

  function matchPct(score) {
    return Math.max(12, Math.min(99, Math.round(50 + 49 * Math.tanh((score - 60) / 60))));
  }

  function buildContext(st) {
    var now = st.now ? taipeiNow(st.now) : taipeiNow();
    var weather = weatherIds(st.weather).map(function (id) { return byId(D.WEATHER, id); }).filter(Boolean);
    return {
      now: now,
      nowMs: (st.now || new Date()).getTime(),
      weather: weather,
      mood: st.mood ? byId(D.MOODS, st.mood) : null,
      companions: (st.companions || []).map(function (id) { return byId(D.COMPANIONS, id); }).filter(Boolean),
      festivals: activeFestivals(now),
      county: st.county ? byId(D.COUNTIES, st.county) : null,
    };
  }

  function recommend(st) {
    var ctx = buildContext(st);
    var pool = D.FOODS.filter(function (food) { return eligible(food, st, ctx.now.m); });
    // 只推在地代表性美食；這個時段沒有符合的在地美食時，退回全部美食並註明
    ctx.localOnly = false;
    ctx.localFallback = false;
    if (st.localOnly && st.county) {
      var localPool = pool.filter(function (food) { return food.county; });
      if (localPool.length) { pool = localPool; ctx.localOnly = true; } else { ctx.localFallback = true; }
    }
    var ranked = pool
      .map(function (food) { return scoreFood(food, st, ctx); })
      .sort(function (a, b) { return b.score - a.score; });

    // 前六名：同類別最多兩道，避免一整排都是麵；同一種菜（第一個搜尋關鍵字相同）只留一道
    var picks = [];
    var perCat = {};
    var seen = {};
    for (var i = 0; i < ranked.length && picks.length < 6; i++) {
      var cat = ranked[i].food.cat;
      var k0 = firstKeyword(ranked[i].food);
      if ((perCat[cat] || 0) >= 2 || seen[k0]) continue;
      perCat[cat] = (perCat[cat] || 0) + 1;
      seen[k0] = true;
      picks.push(ranked[i]);
    }
    // 候選太少（例如只推在地美食）時，放寬同類別限制補滿六道
    for (var f2 = 0; f2 < ranked.length && picks.length < 6; f2++) {
      var fk = firstKeyword(ranked[f2].food);
      if (picks.indexOf(ranked[f2]) >= 0 || seen[fk]) continue;
      seen[fk] = true;
      picks.push(ranked[f2]);
    }
    // 至少放兩道在地美食（分數別差太多的話），在地是這個 App 的重點
    var locals = ranked.filter(function (r) { return r.food.county; });
    var have = picks.filter(function (p) { return p.food.county; }).length;
    var floor = picks.length ? picks[0].score - 60 : -Infinity;
    for (var j = 0; j < locals.length && have < 2; j++) {
      if (picks.indexOf(locals[j]) >= 0 || locals[j].score < floor) continue;
      var drop = -1;
      var lk = firstKeyword(locals[j].food);
      for (var d = 0; d < picks.length; d++) if (firstKeyword(picks[d].food) === lk) { drop = d; break; }
      if (drop >= 0 && picks[drop].food.county) continue;
      if (drop < 0) for (var k = picks.length - 1; k >= 0; k--) if (!picks[k].food.county) { drop = k; break; }
      if (drop >= 0 && firstKeyword(picks[drop].food) === lk) picks.splice(drop, 1, locals[j]);
      else if (picks.length < 6) picks.push(locals[j]);
      else if (drop >= 0) picks.splice(drop, 1, locals[j]);
      else break;
      have++;
    }
    picks.sort(function (a, b) { return b.score - a.score; });
    picks.forEach(function (p) { p.pct = matchPct(p.score); });
    return { ranked: ranked, picks: picks, ctx: ctx, total: D.FOODS.length };
  }

  // ---------- 推薦理由 ----------
  function sourceLabel(src, st, ctx) {
    var head = src.split(':')[0];
    var key = src.split(':')[1];
    if (head === 'local') return { icon: '📍', text: (ctx.county ? ctx.county.name : '') + '在地美食' };
    if (head === 'season') return { icon: '🗓️', text: '當季限定' };
    if (head === 'weather') {
      var w = byId(D.WEATHER, key);
      return { icon: w.icon, text: w.label };
    }
    if (head === 'mood') return { icon: '💭', text: ctx.mood.label };
    if (head === 'company') {
      if (st.solo) return { icon: '🧍', text: '一個人' };
      return { icon: '👥', text: ctx.companions.map(function (c) { return c.label; }).join('、') || '飯友' };
    }
    if (head === 'size') return { icon: '👥', text: (st.size || 2) + ' 人同行' };
    if (head === 'budget') return { icon: '💰', text: '預算' + byId(D.BUDGETS, st.budget || 2).label };
    if (head === 'diet') return { icon: '🥗', text: '飲食偏好' };
    if (head === 'history') return { icon: '📒', text: '最近吃過' };
    if (head === 'shops') return { icon: '📌', text: '口袋名店' };
    if (head === 'near') return { icon: '📍', text: '就在' + key + '附近' };
    if (head === 'festival') {
      var f = D.FESTIVALS.filter(function (x) { return x.name === key; })[0];
      return { icon: f ? f.icon : '🎉', text: key };
    }
    return { icon: '🎲', text: '阿拉蕾的直覺' };
  }

  function tagText(tag) {
    if (tag === 'price') return '價位';
    if (tag === 'same') return '同一道';
    if (tag === 'cat') return '同類型';
    if (tag === 'festival') return '應景';
    if (tag === 'season') return '當季';
    if (tag === 'luck') return '靈感';
    if (tag === 'shops') return '朋友推薦';
    if (tag === 'near') return '名產產地';
    return D.TAG_LABELS[tag] || D.CAT_LABELS[tag] || tag;
  }

  // 依來源彙整：[{icon, text, tags, delta}]，絕對值大的在前
  function explain(item, st, ctx) {
    var groups = {};
    var order = [];
    item.parts.forEach(function (p) {
      if (!groups[p.src]) { groups[p.src] = { src: p.src, delta: 0, tags: [] }; order.push(p.src); }
      groups[p.src].delta += p.delta;
      var t = tagText(p.tag);
      if (groups[p.src].tags.indexOf(t) < 0) groups[p.src].tags.push(t);
    });
    return order.map(function (src) {
      var g = groups[src];
      var lab = sourceLabel(src, st, ctx);
      return { src: src, icon: lab.icon, text: lab.text, tags: g.tags, delta: g.delta };
    }).filter(function (g) { return g.delta !== 0; })
      .sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
  }

  // ---------- 阿拉蕾的說明（不連線時的版本） ----------
  function companyPhrase(st, ctx) {
    if (st.solo) return '一個人也要好好吃飯';
    var ids = ctx.companions.map(function (c) { return c.id; });
    if (ids.indexOf('client') >= 0) return '跟客戶吃飯要體面又安心';
    if (ids.indexOf('classmate') >= 0) return '跟老同學吃飯，就找有回憶的老味道';
    if (ids.indexOf('date') >= 0) return '約會就選有氣氛的';
    if (ids.indexOf('elder') >= 0) return '有長輩同行，要好咬又順口';
    if (ids.indexOf('kids') >= 0) return '帶小朋友要不辣又好入口';
    return (st.size || 2) + ' 個人一起吃最熱鬧';
  }

  function narrate(item, st, ctx) {
    var slot = byId(D.SLOTS, st.slot);
    var bits = [];
    if (ctx.county) bits.push('在' + ctx.county.name);
    if (ctx.weather.length) bits.push(ctx.weather[ctx.weather.length - 1].phrase);
    var line1 = slot.hello + '！' + bits.join('、') + (bits.length ? '，' : '') +
      (ctx.mood ? ctx.mood.phrase + '，' : '') + companyPhrase(st, ctx) + '。';
    var nearTown = item.parts.filter(function (p) { return p.tag === 'near'; })[0];
    var line2 = (nearTown ? '你就在' + item.food.town + '附近，' : '') +
      '阿拉蕾推薦你吃「' + item.food.name + '」！' + item.food.desc + '。';
    if (item.food.shops) {
      line2 += '\n朋友推薦的口袋名店：' + item.food.shops.map(function (x) { return x.name; }).join('、') + '。';
    }
    var tip = '';
    var ids = ctx.weather.map(function (w) { return w.id; });
    if (ctx.localFallback) tip = '這個時段' + (ctx.county ? ctx.county.name : '') + '的代表性美食都還沒開賣，先推全台美食給你。';
    else if (ctx.festivals.length) tip = (ctx.festivals[0].inDays === 0 ? '今天是' + ctx.festivals[0].name + '，' : '') + ctx.festivals[0].msg;
    else if (ids.indexOf('storm') >= 0) tip = '颱風天別亂跑，叫外送或去樓下超商就好。';
    else if (ids.indexOf('rain') >= 0) tip = '出門記得帶傘喔！';
    else if (st.slot === 'n') tip = '消夜適量，明天的體重計會記得的。';
    else if (item.food.tags.indexOf('spicy') >= 0) tip = '怕辣的話記得先點一杯冰飲。';
    else if (ids.indexOf('scorch') >= 0) tip = '天氣很熱，記得多喝水。';
    return line1 + '\n' + line2 + (tip ? '\n' + tip : '');
  }

  // ---------- 美食稽核報告（ISO/IEC 27001:2022 條文 × 吃飯） ----------
  function audit(item, st, ctx, extra) {
    extra = extra || {};
    var food = item.food;
    var rows = [];
    var weatherText = ctx.weather.map(function (w) { return w.label; }).join('・') || '未提供';
    var slot = byId(D.SLOTS, st.slot);
    var wIds = ctx.weather.map(function (w) { return w.id; });
    var mismatch = (wIds.indexOf('scorch') >= 0 && food.tags.indexOf('hot') >= 0) ||
      (wIds.indexOf('cold') >= 0 && food.tags.indexOf('cold') >= 0);
    rows.push({
      clause: '4.1', title: '了解組織及其前後環境',
      verdict: mismatch ? '觀察事項' : '符合',
      note: (ctx.county ? ctx.county.name : '地點未定') + '・' + weatherText + '・' + slot.label +
        (mismatch ? '。餐點溫度與天氣略有落差，建議搭配飲品調節。' : '。餐點與環境條件相符。'),
    });

    var needs = st.solo ? '單人用餐，已優先考量一人份友善度。' :
      '飯友：' + (ctx.companions.map(function (c) { return c.label; }).join('、') || '未指定') + '，共 ' + (st.size || 2) + ' 人。';
    var companyNeg = item.parts.filter(function (p) { return p.src === 'company' && p.delta < 0; });
    rows.push({
      clause: '4.2', title: '了解利害關係者之需求及期望',
      verdict: companyNeg.length ? '觀察事項' : '符合',
      note: needs + (companyNeg.length ? '部分飯友條件未完全滿足（' + companyNeg.map(function (p) { return tagText(p.tag); }).join('、') + '），請現場確認。' : '已滿足飯友需求。'),
    });

    var diets = (st.diets || []).map(function (id) { return byId(D.DIETS, id).label; });
    var riskNote = diets.length ? '已排除不符合「' + diets.join('、') + '」的品項。' : '無飲食限制，風險可接受。';
    if (food.tags.indexOf('spicy') >= 0) riskNote += '辣度風險：中，建議備妥冰水。';
    if (food.tags.indexOf('fried') >= 0 || food.tags.indexOf('heavy') >= 0) riskNote += '熱量風險：偏高，殘餘風險由當事人承擔。';
    rows.push({ clause: '6.1', title: '因應風險及機會之行動', verdict: '符合', note: riskNote });

    var priceDiff = priceOf(food) - (st.budget || 2);
    rows.push({
      clause: '7.1', title: '資源',
      verdict: priceDiff > 0 ? '觀察事項' : '符合',
      note: '預估價位 ' + '$'.repeat(priceOf(food)) + '，預算「' + byId(D.BUDGETS, st.budget || 2).label + '」' +
        (priceDiff > 0 ? '，可能超支，請確認錢包可用性（Availability）。' : '，資源充足。'),
    });

    var recent = (st.history || []).filter(function (h) { return (ctx.nowMs - h.ts) / 86400000 <= 7; });
    var sameCat = recent.filter(function (h) { return h.cat === food.cat; }).length;
    rows.push({
      clause: '9.1', title: '監督、量測、分析及評估',
      verdict: sameCat >= 2 ? '觀察事項' : '符合',
      note: recent.length ? '近 7 天紀錄 ' + recent.length + ' 餐，同類型「' + (D.CAT_LABELS[food.cat] || food.cat) + '」' + sameCat + ' 次' +
        (sameCat >= 2 ? '，建議分散風險，避免單點故障。' : '，飲食多樣性良好。') : '美食護照尚無紀錄，建議蓋章以利持續量測。',
    });

    rows.push({
      clause: 'A.5.34', title: '隱私及個人可識別資訊（PII）之保護', verdict: '符合',
      note: extra.located ? '定位座標僅用於查詢，送出前已模糊化（天氣約 1 公里、店家約 100 公尺），不留存於伺服器。' : '未使用定位，僅以縣市判斷，無 PII 外流風險。',
    });

    var ofi = rows.filter(function (r) { return r.verdict === '觀察事項'; }).length;
    return {
      rows: rows,
      ofi: ofi,
      conclusion: ofi === 0 ? '本次餐點選擇符合要求，建議核發「今日美食驗證證書」。' :
        '發現 ' + ofi + ' 項觀察事項，無主要不符合事項，建議有條件通過，並於下一餐持續改善（10.1）。',
    };
  }

  root.WTE.engine = {
    taipeiNow: taipeiNow, slotFor: slotFor, classifyWeather: classifyWeather, weatherIds: weatherIds,
    describeWeatherCode: describeWeatherCode, activeFestivals: activeFestivals, detectCounty: detectCounty,
    haversine: haversine, recommend: recommend, explain: explain, narrate: narrate, audit: audit,
    matchPct: matchPct, priceOf: priceOf, byId: byId, tagText: tagText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
