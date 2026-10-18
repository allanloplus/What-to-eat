/* 我在哪裡，要吃甚麼？ — 介面與互動 */
(function () {
  'use strict';
  const D = WTE.DATA;
  const E = WTE.engine;
  const S = WTE.svc;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const IMG = (name) => 'assets/img/' + name + '.webp';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const PREFS_KEY = 'wte.prefs.v1';
  const prefs = S.store.get(PREFS_KEY, {});
  const clock = E.taipeiNow();

  const state = {
    step: 0,
    county: null,
    coords: null, // 精確座標只留在記憶體，不寫入儲存
    located: false,
    weather: { temp: null, rain: false, storm: false },
    wxLive: null,
    slot: E.slotFor(clock.minutes),
    mood: null,
    moodGuessed: false,
    solo: true,
    companions: [],
    size: 2,
    names: [],
    me: prefs.me || 'Allan',
    budget: prefs.budget || 2,
    diets: Array.isArray(prefs.diets) ? prefs.diets : [],
    distance: prefs.distance || 'walk',
    seed: Math.floor(Math.random() * 1e6),
    result: null,
    st: null,
    main: 0,
    narration: '',
    aiCtl: null,
    cardBlob: null,
  };

  const TEMP_IDS = ['scorch', 'hot', 'nice', 'cool', 'cold'];
  const SKY = [
    { id: 'clear', label: '沒下雨', icon: '⛅' },
    { id: 'rain', label: '下雨', icon: '🌧️' },
    { id: 'storm', label: '颱風', icon: '🌀' },
  ];
  const SLOT_HOURS = { b: '05:00–10:30', l: '10:30–14:00', t: '14:00–17:00', d: '17:00–21:00', n: '21:00–05:00' };
  const STEP_LINES = [
    ['laugh', '{me}，你現在在哪裡呀？可以讓我定位，或直接點地圖上的縣市～'],
    ['explain', '天氣和時段我幫你看好了，不對的話可以自己改喔！'],
    ['think', '今天心情怎麼樣？選一張最像你的臉！'],
    ['surprise', '今天一個人吃，還是有飯友呢？'],
    ['wink', '最後一格！預算和忌口告訴我，就可以開始分析囉。'],
  ];
  const ALLAN_SAYS = {
    calm: '不錯喔！', joy: '好耶！', unsure: '好⋯好吧！', curious: '哇，沒吃過！', busy: '快走快走！',
    stressed: '吃完再戰！', sad: '嗚嗚⋯好想吃', treat: '今天我最大！', tired: '終於能吃飯了⋯',
  };

  const byId = E.byId;
  const countyObj = () => (state.county ? byId(D.COUNTIES, state.county) : null);
  const slotObj = () => byId(D.SLOTS, state.slot);
  const savePrefs = () => S.store.set(PREFS_KEY, { me: state.me, budget: state.budget, diets: state.diets, distance: state.distance });

  // ---------- 阿拉蕾說話 ----------
  function typeInto(el, text, speed) {
    clearInterval(el._typer);
    if (reduceMotion) { el.textContent = text; return; }
    let i = 0;
    el.textContent = '';
    el._typer = setInterval(() => {
      i += 2;
      el.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(el._typer);
    }, speed || 24);
  }

  function say(face, text) {
    const img = $('#host-img');
    if (face) {
      img.src = IMG('arale-' + face);
      const frame = img.parentElement;
      frame.classList.remove('pop');
      void frame.offsetWidth;
      frame.classList.add('pop');
    }
    typeInto($('#host-say'), text.replace('{me}', state.me));
  }

  // ---------- 方塊地圖 ----------
  function buildTilemap(el, opts) {
    el.innerHTML = '';
    D.COUNTIES.forEach((c) => {
      const t = document.createElement(opts.stamps ? 'div' : 'button');
      t.className = 'tile' + (c.region === '離島' ? ' island' : '');
      t.style.gridColumn = String(c.grid[0] + 1);
      t.style.gridRow = (c.grid[1] + 1) + ' / span ' + c.grid[2];
      t.dataset.id = c.id;
      if (opts.stamps) {
        const ts = opts.stamps[c.id];
        t.classList.toggle('stamped', !!ts);
        t.innerHTML = esc(c.short) + (ts ? '<small>' + fmtDate(ts) + '</small>' : '');
        t.title = c.name + (ts ? '：' + fmtDate(ts) + ' 首次蓋章' : '：尚未蓋章');
      } else {
        t.type = 'button';
        t.textContent = c.short;
        t.setAttribute('aria-label', c.name);
        t.setAttribute('aria-pressed', 'false');
        t.addEventListener('click', () => selectCounty(c.id));
        t.addEventListener('mouseenter', () => previewCounty(c.id));
        t.addEventListener('focus', () => previewCounty(c.id));
      }
      el.appendChild(t);
    });
    const sea = document.createElement('span');
    sea.className = 'sea-label';
    sea.textContent = '臺灣海峽';
    el.appendChild(sea);
  }

  function renderCountyCard(id) {
    const card = $('#county-card');
    const c = id ? byId(D.COUNTIES, id) : null;
    if (!c) {
      card.innerHTML = '<p class="county-empty">點一個縣市，看看當地有什麼好吃的。</p>';
      return;
    }
    const month = E.taipeiNow().m;
    card.innerHTML =
      '<h3>' + esc(c.name) + '<span class="region">' + esc(c.region) + '</span></h3>' +
      '<p class="blurb">' + esc(c.blurb) + '</p>' +
      '<ul>' + c.foods.map((f) => {
        const off = f.months && f.months.indexOf(month) < 0;
        return '<li' + (off ? ' class="off" title="非當季"' : '') + '>' + f.emoji + ' ' + esc(f.name) + '</li>';
      }).join('') + '</ul>';
  }

  function previewCounty(id) {
    if (!state.county) renderCountyCard(id);
  }

  function selectCounty(id, opts) {
    opts = opts || {};
    const c = byId(D.COUNTIES, id);
    if (!opts.fromGps && state.coords) {
      const hit = E.detectCounty(state.coords.lat, state.coords.lon);
      if (!hit || hit.county.id !== id) { state.coords = null; state.located = false; }
    }
    state.county = id;
    $$('#tilemap .tile').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.id === id)));
    renderCountyCard(id);
    const names = c.foods.slice(0, 3).map((f) => f.name).join('、');
    say('surprise', c.name + '！' + c.blurb + '。在地有' + names + '⋯好期待！');
    if (!opts.fromGps) {
      $('#locate-msg').textContent = '已選擇 ' + c.name + '，天氣以縣市中心查詢';
      refreshWeather(c.seat[0], c.seat[1]);
    }
    updateSummary();
  }

  // ---------- 定位 ----------
  async function doLocate(quiet) {
    const btn = $('#locate');
    const msg = $('#locate-msg');
    btn.disabled = true;
    msg.textContent = '定位中⋯';
    try {
      const pos = await S.locate();
      state.coords = pos;
      state.located = true;
      const hit = E.detectCounty(pos.lat, pos.lon);
      if (hit) {
        selectCounty(hit.county.id, { fromGps: true });
        msg.textContent = '已定位：' + hit.county.name + (pos.accuracy > 0 ? '（精確度約 ' + Math.round(pos.accuracy) + ' 公尺）' : '');
      } else {
        msg.textContent = '你好像不在台灣？先手動選一個縣市吧。';
        if (!quiet) say('surprise', '咦？你好像不在台灣耶！先選一個想吃的縣市吧～');
      }
      refreshWeather(pos.lat, pos.lon);
      return true;
    } catch (err) {
      msg.textContent = err && err.code === 1 ? '沒有允許定位，直接點地圖選縣市也可以。' : '這個環境無法定位，請直接點地圖選縣市。';
      if (!quiet) say('confused', '定位失敗了⋯直接點地圖告訴我你在哪吧！');
      return false;
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- 天氣 ----------
  function weatherIcon() {
    const w = state.weather;
    if (w.storm) return '🌀';
    if (w.rain) return '🌧️';
    const t = w.temp ? byId(D.WEATHER, w.temp) : null;
    return t ? t.icon : '🌤️';
  }

  function isNight() {
    if (state.wxLive && state.wxLive.is_day === 0) return true;
    const h = E.taipeiNow().hh;
    return h < 6 || h >= 18;
  }

  function paintSky() {
    const sky = $('#sky');
    const w = state.weather;
    sky.dataset.wx = w.storm ? 'storm' : w.rain ? 'rain' : (w.temp || 'nice');
    sky.dataset.night = String(isNight());
  }

  function renderWeather() {
    const live = state.wxLive;
    $('#wx-icon').textContent = weatherIcon();
    if (live) {
      $('#wx-temp').textContent = Math.round(live.temperature_2m) + '°C';
      $('#wx-desc').textContent = E.describeWeatherCode(live.weather_code) + '・體感 ' + Math.round(live.apparent_temperature) +
        '°C・風速 ' + Math.round(live.wind_speed_10m) + ' km/h（Open-Meteo）';
    }
    $$('#temp-chips .chip').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === state.weather.temp)));
    const skyId = state.weather.storm ? 'storm' : state.weather.rain ? 'rain' : 'clear';
    $$('#sky-chips .chip').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === skyId)));
    paintSky();
    updateSummary();
  }

  let wxSeq = 0;
  async function refreshWeather(lat, lon) {
    const seq = ++wxSeq;
    state.wxPoint = [lat, lon];
    const box = $('#wx-now');
    box.classList.add('loading');
    $('#wx-desc').textContent = '查詢即時天氣中⋯';
    try {
      const cur = await S.weather(lat, lon);
      if (seq !== wxSeq) return;
      state.wxLive = cur;
      state.weather = E.classifyWeather(cur);
      renderWeather();
    } catch (e) {
      if (seq !== wxSeq) return;
      state.wxLive = null;
      $('#wx-temp').textContent = '--°';
      $('#wx-desc').textContent = '查不到即時天氣（網路或瀏覽環境限制），請在下面手動選擇。';
      if (state.step === 1) say('confused', '天氣查不到耶⋯幫我點一下現在的天氣好嗎？');
    } finally {
      if (seq === wxSeq) box.classList.remove('loading');
    }
  }

  function buildWeatherControls() {
    const temps = $('#temp-chips');
    TEMP_IDS.forEach((id) => {
      const w = byId(D.WEATHER, id);
      temps.appendChild(radioChip(id, w.icon + ' ' + w.label, () => {
        state.weather.temp = id;
        renderWeather();
      }));
    });
    const skies = $('#sky-chips');
    SKY.forEach((s) => {
      skies.appendChild(radioChip(s.id, s.icon + ' ' + s.label, () => {
        state.weather.rain = s.id !== 'clear';
        state.weather.storm = s.id === 'storm';
        renderWeather();
        if (s.id === 'storm') say('surprise', '颱風天！安全第一，阿拉蕾會優先推薦外送和近的～');
      }));
    });
    const slots = $('#slot-chips');
    D.SLOTS.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot';
      b.dataset.id = s.id;
      b.setAttribute('role', 'radio');
      b.innerHTML = '<span>' + s.icon + '</span><b>' + s.label + '</b><small>' + SLOT_HOURS[s.id] + '</small>';
      b.addEventListener('click', () => { state.slot = s.id; renderSlots(); });
      slots.appendChild(b);
    });
    $('#clock-hint').textContent = '（' + pad(clock.hh) + ':' + pad(clock.mm) + ' 自動判斷）';
    $('#wx-refresh').addEventListener('click', () => {
      if (state.coords) refreshWeather(state.coords.lat, state.coords.lon);
      else if (state.county) { const c = countyObj(); refreshWeather(c.seat[0], c.seat[1]); }
      else { $('#wx-desc').textContent = '先在第 1 格選縣市或定位，才知道要查哪裡的天氣。'; }
    });
  }

  function renderSlots() {
    $$('#slot-chips .slot').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === state.slot)));
    updateSummary();
  }

  function radioChip(id, label, onPick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.id = id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.textContent = label;
    b.addEventListener('click', onPick);
    return b;
  }

  function toggleChip(id, label, pressed, onToggle) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.id = id;
    b.setAttribute('aria-pressed', String(pressed));
    b.textContent = label;
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      onToggle(on);
    });
    return b;
  }

  // ---------- 心情 ----------
  function buildMoods() {
    const box = $('#moods');
    D.MOODS.forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mood';
      b.dataset.id = m.id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.setAttribute('aria-label', m.label + '：' + m.sub);
      b.innerHTML = '<img src="' + IMG('allan-' + m.id) + '" alt="" width="228" height="300" loading="lazy">' +
        '<span class="mood-label">' + m.label + '</span><span class="mood-sub">' + m.sub + '</span>';
      b.addEventListener('click', () => {
        state.mood = m.id;
        state.moodGuessed = false;
        renderMoods();
        say(m.arale, m.say);
      });
      box.appendChild(b);
    });
  }
  function renderMoods() {
    $$('#moods .mood').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === state.mood)));
    updateSummary();
  }

  // ---------- 飯友 ----------
  function buildCompanions() {
    $$('#solo-seg button').forEach((b) => b.addEventListener('click', () => {
      state.solo = b.dataset.solo === '1';
      if (!state.solo && state.size < 2) state.size = 2;
      renderCompanions();
      say(state.solo ? 'wink' : 'laugh', state.solo ? '一個人吃飯也很棒，想吃什麼就吃什麼！' : '有飯友最開心了！告訴我是誰～');
    }));
    const chips = $('#companion-chips');
    D.COMPANIONS.forEach((c) => {
      chips.appendChild(toggleChip(c.id, c.icon + ' ' + c.label, false, (on) => {
        state.companions = on ? state.companions.concat(c.id) : state.companions.filter((x) => x !== c.id);
        if (on && c.id === 'client') say('explain', '跟客戶吃飯？阿拉蕾會避開路邊攤和味道重的。');
        if (on && c.id === 'date') say('wink', '約會呀～我會挑有氣氛的，蒜頭和臭豆腐先不要！');
        updateSummary();
      }));
    });
    $('#size-minus').addEventListener('click', () => { state.size = Math.max(2, state.size - 1); renderCompanions(); });
    $('#size-plus').addEventListener('click', () => { state.size = Math.min(30, state.size + 1); renderCompanions(); });
    $('#name-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#name-input');
      const name = input.value.trim();
      if (name && state.names.indexOf(name) < 0 && state.names.length < 20) {
        state.names.push(name);
        if (state.names.length + 1 > state.size) state.size = state.names.length + 1;
      }
      input.value = '';
      renderCompanions();
    });
    const me = $('#me-input');
    me.value = state.me;
    me.addEventListener('input', () => {
      state.me = me.value.trim() || 'Allan';
      savePrefs();
      $('#hero-bubble').textContent = heroLine();
    });
  }

  function renderCompanions() {
    $$('#solo-seg button').forEach((b) => b.setAttribute('aria-checked', String((b.dataset.solo === '1') === state.solo)));
    $('#group-opts').hidden = state.solo;
    $('#size-out').textContent = state.size;
    const box = $('#name-chips');
    box.innerHTML = '';
    state.names.forEach((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('aria-label', '移除 ' + n);
      b.innerHTML = esc(n) + ' <span class="x-mark" aria-hidden="true">✕</span>';
      b.addEventListener('click', () => { state.names = state.names.filter((x) => x !== n); renderCompanions(); });
      box.appendChild(b);
    });
    updateSummary();
  }

  // ---------- 偏好 ----------
  function buildPrefs() {
    const budget = $('#budget-seg');
    D.BUDGETS.forEach((b) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.dataset.id = b.id;
      el.setAttribute('role', 'radio');
      el.innerHTML = b.label + '<small>' + b.hint + '</small>';
      el.addEventListener('click', () => { state.budget = b.id; savePrefs(); renderPrefs(); });
      budget.appendChild(el);
    });
    const diets = $('#diet-chips');
    D.DIETS.forEach((d) => {
      diets.appendChild(toggleChip(d.id, d.label, state.diets.indexOf(d.id) >= 0, (on) => {
        state.diets = on ? state.diets.concat(d.id) : state.diets.filter((x) => x !== d.id);
        savePrefs();
        updateSummary();
      }));
    });
    const dist = $('#distance-seg');
    D.DISTANCES.forEach((d) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.dataset.id = d.id;
      el.setAttribute('role', 'radio');
      el.innerHTML = d.icon + ' ' + d.label + '<small>' + fmtDist(d.meters) + ' 內</small>';
      el.addEventListener('click', () => { state.distance = d.id; savePrefs(); renderPrefs(); });
      dist.appendChild(el);
    });
  }
  function renderPrefs() {
    $$('#budget-seg button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.id) === state.budget)));
    $$('#distance-seg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === state.distance)));
    updateSummary();
  }

  // ---------- 分格導覽 ----------
  function goStep(n, quiet) {
    state.step = n;
    $$('.board .panel').forEach((p) => { p.hidden = Number(p.dataset.step) !== n; });
    $$('#strip button').forEach((b) => {
      if (Number(b.dataset.step) === n) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    $('#prev').disabled = n === 0;
    $('#next').hidden = n === 4;
    $('#analyze').textContent = n === 4 ? '🔮 開始分析' : '🔮 直接分析';
    if (!quiet) say(STEP_LINES[n][0], STEP_LINES[n][1]);
  }

  function updateSummary() {
    const c = countyObj();
    const slot = slotObj();
    const temp = state.wxLive ? Math.round(state.wxLive.apparent_temperature) + '°' : '';
    const wLabel = state.weather.temp ? byId(D.WEATHER, state.weather.temp).label : '';
    const mood = state.mood ? byId(D.MOODS, state.mood) : null;
    $('#sum-0').textContent = c ? c.name : '未選';
    $('#sum-1').textContent = weatherIcon() + (temp || wLabel || '') + '・' + slot.label;
    $('#sum-2').textContent = mood ? mood.label : '未選';
    $('#sum-3').textContent = state.solo ? '一個人' : state.size + ' 人';
    $('#sum-4').textContent = byId(D.BUDGETS, state.budget).label + (state.diets.length ? '・忌口 ' + state.diets.length : '');
    $('#st-place').textContent = '📍 ' + (c ? c.name : '選地點');
    $('#st-weather').textContent = weatherIcon() + ' ' + (temp || wLabel || '天氣');
    $('#st-slot').textContent = slot.icon + ' ' + slot.label;
    const done = [!!c, !!state.weather.temp, !!state.mood, true, true];
    $$('#strip button').forEach((b) => b.classList.toggle('done', done[Number(b.dataset.step)]));
  }

  // ---------- 分析 ----------
  function engineState() {
    const meals = S.passport.load().meals;
    return {
      county: state.county,
      slot: state.slot,
      weather: state.weather.temp || state.weather.rain ? state.weather : null,
      mood: state.mood,
      solo: state.solo,
      companions: state.companions,
      size: state.solo ? 1 : state.size,
      budget: state.budget,
      diets: state.diets,
      history: meals.map((m) => ({ id: m.id, cat: m.cat, ts: m.ts })),
      seed: state.seed,
    };
  }

  function analysisLines(res, st) {
    const c = countyObj();
    const mood = state.mood ? byId(D.MOODS, state.mood) : null;
    const eligible = res.ranked.length;
    const wx = res.ctx.weather.map((w) => w.label).join('・') || '未知（略過）';
    const who = state.solo ? '一個人' : (res.ctx.companions.map((x) => x.label).join('、') || '飯友') + '，' + st.size + ' 人';
    return [
      ['📍', '讀取地理環境：' + (c ? c.name + '（' + c.foods.length + ' 道在地美食）' : '未指定，用全台通用美食')],
      ['🌦️', '分析天氣：' + wx],
      ['🕐', '確認時段：' + slotObj().label],
      ['💭', '判讀心情：' + (mood ? (state.moodGuessed ? '我猜是「' + mood.label + '」' : mood.label) : '交給直覺')],
      ['👥', '評估利害關係人（飯友）需求：' + who],
      ['🧮', '計算 ' + eligible + ' / ' + res.total + ' 道美食的適配分數'],
      ['✅', res.picks.length ? '風險評鑑完成，產出推薦！' : '條件太嚴格，找不到符合的餐點'],
    ];
  }

  let skipAnalysis = null;
  async function playAnalysis(lines) {
    const overlay = $('#analysis');
    const log = $('#ana-log');
    log.innerHTML = '';
    overlay.hidden = false;
    $('#ana-skip').focus({ preventScroll: true });
    let skipped = false;
    skipAnalysis = () => { skipped = true; };
    for (const [icon, text] of lines) {
      const li = document.createElement('li');
      li.className = 'busy';
      li.innerHTML = '<span>' + icon + '</span><span>' + esc(text) + '</span>';
      log.appendChild(li);
      if (!skipped) await wait(380);
      li.classList.remove('busy');
    }
    if (!skipped) await wait(350);
    overlay.hidden = true;
    skipAnalysis = null;
  }

  async function analyze() {
    if (state.aiCtl) state.aiCtl.abort();
    const st = engineState();
    const res = E.recommend(st);
    state.result = res;
    state.st = st;
    state.main = 0;
    await playAnalysis(analysisLines(res, st));
    $('#nearby').hidden = true;
    $('#result').hidden = false;
    renderResult();
    $('#result').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    if (res.picks.length) askClaude();
  }

  // ---------- 結果 ----------
  function currentItem() {
    return state.result && state.result.picks[state.main];
  }

  function renderResult() {
    const res = state.result;
    const item = currentItem();
    const pick = $('#pick');
    $('#ai-badge').hidden = true;
    $('#ai-note').hidden = true;
    if (!item) {
      pick.hidden = true;
      $$('.actions, .tabs, #tab-why, #tab-audit, .alts-title, #alts').forEach((el) => { el.hidden = true; });
      $('#res-arale').src = IMG('arale-sad');
      $('#res-text').textContent = '嗚⋯條件太嚴格了，阿拉蕾找不到符合的餐點。放寬忌口、預算或換個時段再試試看！';
      return;
    }
    pick.hidden = false;
    $$('.actions, .tabs, .alts-title, #alts').forEach((el) => { el.hidden = false; });
    selectTab(document.querySelector('#tab-audit-btn').getAttribute('aria-selected') === 'true' ? 'audit' : 'why');
    renderPick(item);
    state.narration = E.narrate(item, state.st, res.ctx);
    $('#res-arale').src = IMG('arale-explain');
    $('#res-text').classList.remove('typing');
    typeInto($('#res-text'), state.narration, 18);
    renderWhy(item);
    renderAudit(item);
    renderAlts();
    $('#act-payer').hidden = state.solo;
  }

  function renderPick(item) {
    const f = item.food;
    const c = f.county ? byId(D.COUNTIES, f.county) : null;
    $('#pick-emoji').textContent = f.emoji;
    $('#pick-name').textContent = f.name;
    $('#pick-desc').textContent = f.desc;
    const tags = [];
    if (c) tags.push('<span class="tag local">' + esc(c.short) + '在地</span>');
    if (f.months) tags.push('<span class="tag">當季限定</span>');
    state.result.ctx.festivals.forEach((fest) => {
      if (fest.boost.indexOf(f.name) >= 0) tags.push('<span class="tag fest">' + fest.icon + ' ' + esc(fest.name) + '應景</span>');
    });
    tags.push('<span class="tag">' + esc(D.CAT_LABELS[f.cat] || f.cat) + '</span>');
    $('#pick-tags').innerHTML = tags.join('');
    $('#pick-pct').textContent = item.pct;
    $('#pick-meter').style.setProperty('--pct', item.pct);
    $('#pick-price').textContent = '$'.repeat(E.priceOf(f)) + ' ・' + slotObj().label;
    const plate = $('#plate');
    plate.classList.toggle('hot', f.tags.indexOf('hot') >= 0 || f.tags.indexOf('soup') >= 0);
    plate.classList.toggle('icy', f.tags.indexOf('ice') >= 0 || f.tags.indexOf('cold') >= 0);
    $('#res-allan').src = IMG('allan-' + (state.mood || 'calm'));
    $('#res-allan-say').textContent = state.mood ? ALLAN_SAYS[state.mood] : '聽起來不錯！';
    const eaten = S.passport.load().meals.find((m) => m.id === f.id && E.taipeiNow(new Date(m.ts)).date === E.taipeiNow().date);
    $('#pick-stamp').hidden = !eaten;
    if (eaten) $('#stamp-date').textContent = fmtDate(eaten.ts);
    $('#act-eat').disabled = !!eaten;
    $('#act-eat').textContent = eaten ? '✅ 已蓋章' : '✅ 就吃這個';
  }

  function renderWhy(item) {
    const groups = E.explain(item, state.st, state.result.ctx);
    const max = Math.max.apply(null, groups.map((g) => Math.abs(g.delta)).concat([1]));
    $('#tab-why').innerHTML =
      '<ul class="why">' + groups.map((g) => {
        const neg = g.delta < 0;
        return '<li><span class="src">' + g.icon + ' ' + esc(g.text) + '</span>' +
          '<span class="bar"><i class="' + (neg ? 'neg' : '') + '" style="width:' + Math.round(Math.abs(g.delta) / max * 100) + '%"></i>' +
          '<span>' + esc(g.tags.slice(0, 3).join('、')) + '</span></span>' +
          '<span class="pts' + (neg ? ' neg' : '') + '">' + (neg ? '' : '+') + g.delta + '</span></li>';
      }).join('') + '</ul>' +
      '<p class="why-foot">基本分 20，加總 ' + item.score + ' 分。阿拉蕾在 ' + state.result.ranked.length +
      ' 道符合時段與忌口的美食中排序，同類型最多取兩道，並保留至少兩道在地美食。</p>';
  }

  function renderAudit(item) {
    const a = E.audit(item, state.st, state.result.ctx, { located: state.located });
    const now = E.taipeiNow();
    $('#tab-audit').innerHTML =
      '<div class="audit-head"><h3>美食稽核報告 <small>Food Audit Report</small></h3>' +
      '<div class="audit-meta"><span>稽核員</span><span>阿拉蕾 AI（Lead Auditor）</span>' +
      '<span>受稽核者</span><span>' + esc(state.me) + '</span>' +
      '<span>稽核標的</span><span>' + esc(item.food.name) + '・' + slotObj().label + '</span>' +
      '<span>日期</span><span>' + now.date + ' ' + pad(now.hh) + ':' + pad(now.mm) + '</span></div></div>' +
      '<div class="audit-scroll"><table class="audit-table"><thead><tr><th>條文</th><th>要求事項</th><th>判定</th><th>稽核發現</th></tr></thead><tbody>' +
      a.rows.map((r) => '<tr><td class="cl">' + r.clause + '</td><td class="tt">' + esc(r.title) + '</td><td><span class="verdict' +
        (r.verdict === '符合' ? '' : ' ofi') + '">' + r.verdict + '</span></td><td>' + esc(r.note) + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<div class="audit-foot"><p>結論：' + esc(a.conclusion) + '</p><div class="audit-stamp' + (a.ofi ? ' ofi' : '') + '">' +
      (a.ofi ? 'COND.<br>PASS' : 'PASS') + '<small>' + now.date + '</small></div></div>' +
      '<p class="audit-note">條文編號取自 ISO/IEC 27001:2022 的章節與附錄 A，套用在吃飯上純屬娛樂，不是正式驗證。</p>';
  }

  function renderAlts() {
    const box = $('#alts');
    box.innerHTML = '';
    state.result.picks.forEach((p, i) => {
      if (i === state.main) return;
      const c = p.food.county ? byId(D.COUNTIES, p.food.county) : null;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'alt';
      b.innerHTML = '<span class="e">' + p.food.emoji + '</span><b>' + esc(p.food.name) + '</b>' +
        '<small>' + esc(c ? c.short + '在地' : D.CAT_LABELS[p.food.cat]) + '</small><span class="pct">' + p.pct + '% 適配</span>';
      b.addEventListener('click', () => setMain(i));
      box.appendChild(b);
    });
  }

  function setMain(i, keepText) {
    if (state.aiCtl && !keepText) state.aiCtl.abort();
    state.main = i;
    const item = currentItem();
    renderPick(item);
    renderWhy(item);
    renderAudit(item);
    renderAlts();
    $('#nearby').hidden = true;
    if (!keepText) {
      $('#ai-badge').hidden = true;
      $('#ai-note').hidden = true;
      $('#res-arale').src = IMG('arale-wink');
      state.narration = '好眼光！' + item.food.name + '也很適合現在：' + item.food.desc + '。';
      typeInto($('#res-text'), state.narration, 18);
    }
    const pick = $('#pick');
    pick.style.animation = 'none';
    void pick.offsetWidth;
    pick.style.animation = '';
  }

  function selectTab(which) {
    const why = which === 'why';
    $('#tab-why-btn').setAttribute('aria-selected', String(why));
    $('#tab-audit-btn').setAttribute('aria-selected', String(!why));
    $('#tab-why').hidden = !why;
    $('#tab-audit').hidden = why;
  }

  // ---------- Claude（只在 claude.ai Artifact 內可用） ----------
  function claudePrompt() {
    const res = state.result;
    const st = state.st;
    const c = countyObj();
    const mood = state.mood ? byId(D.MOODS, state.mood) : null;
    const now = E.taipeiNow();
    const recent = S.passport.load().meals.slice(0, 5).map((m) => m.name);
    const wx = res.ctx.weather.map((w) => w.label).join('、') || '未知';
    const lines = res.picks.map((p, i) => {
      const pc = p.food.county ? byId(D.COUNTIES, p.food.county) : null;
      return (i + 1) + '. ' + p.food.name + '｜' + (D.CAT_LABELS[p.food.cat] || p.food.cat) + '｜' +
        (pc ? pc.name + '在地' : '全台通用') + '｜' + p.food.desc;
    });
    return [
      '你是「阿拉蕾」，戴耳機、綁雙馬尾的台灣 AI 美食小助手，說話活潑貼心，用台灣用語的繁體中文。你正在幫 ' + state.me + ' 決定這一餐要吃什麼。',
      '',
      '【情境】',
      '- 地點：' + (c ? c.name : '未指定（全台）'),
      '- 時段：' + slotObj().label + '（現在 ' + pad(now.hh) + ':' + pad(now.mm) + '）',
      '- 天氣：' + wx + (state.wxLive ? '，體感 ' + Math.round(state.wxLive.apparent_temperature) + '°C' : ''),
      '- 心情：' + (mood ? mood.label + '（' + mood.sub + '）' : '沒說'),
      '- 飯友：' + (state.solo ? '一個人' : (res.ctx.companions.map((x) => x.label).join('、') || '朋友') + '，共 ' + st.size + ' 人' +
        (state.names.length ? '（' + state.names.join('、') + '）' : '')),
      '- 預算：' + byId(D.BUDGETS, state.budget).label + '；忌口：' + (state.diets.map((d) => byId(D.DIETS, d).label).join('、') || '無'),
      '- 節日：' + (res.ctx.festivals.map((f) => f.name).join('、') || '無'),
      '- 最近吃過：' + (recent.join('、') || '沒有紀錄'),
      '',
      '【候選（系統已依條件評分，由高到低）】',
      lines.join('\n'),
      '',
      '【回覆格式】',
      '第一行只寫「推薦：」加上一個候選名稱（必須和上面某個候選完全一樣）。',
      '接著用 2 到 3 句話（合計 120 字以內）直接對 ' + state.me + ' 說為什麼現在適合吃它，要呼應天氣、心情或飯友，最後給一個點餐小撇步。不要用 Markdown，不要條列。',
    ].join('\n');
  }

  async function askClaude() {
    const sample = await S.capability('sample');
    if (!sample || !state.result) return;
    const ctl = new AbortController();
    state.aiCtl = ctl;
    const out = $('#res-text');
    const badge = $('#ai-badge');
    const note = $('#ai-note');
    const strip = (t) => t.replace(/^\s*推薦[:：][^\n]*\n?/, '').trim();
    badge.hidden = false;
    note.hidden = false;
    note.textContent = '阿拉蕾正在請 Claude 想一想⋯';
    let started = false;
    try {
      const r = await sample(claudePrompt(), {
        modelTier: 'quick',
        signal: ctl.signal,
        onText: ({ text }) => {
          const body = strip(text);
          if (!body) return;
          if (!started) { started = true; clearInterval(out._typer); out.classList.add('typing'); note.hidden = true; }
          out.textContent = body;
        },
      });
      out.classList.remove('typing');
      const m = r.text.match(/推薦[:：]\s*([^\n]+)/);
      if (m) {
        const name = m[1].replace(/[「」『』\s。！!]/g, '');
        const idx = state.result.picks.findIndex((p) => p.food.name === name);
        if (idx >= 0 && idx !== state.main) setMain(idx, true);
      }
      const body = strip(r.text);
      if (body) { state.narration = body; out.textContent = body; }
      if (r.truncated) { note.hidden = false; note.textContent = '回答太長被截斷了，上面是 Claude 寫到的部分。'; }
    } catch (e) {
      out.classList.remove('typing');
      if (e && e.code === 'cancelled') return;
      badge.hidden = true;
      out.textContent = state.narration;
      note.hidden = false;
      const code = e && e.code;
      note.textContent = code === 'not_granted' || code === 'sampling_disabled' ? '沒有開啟 Claude 權限，先用阿拉蕾內建的說明。' :
        code === 'rate_limited' ? 'Claude 現在有點忙，先用內建說明，等一下按「換一批」再試。' :
          'Claude 暫時連不上，先用阿拉蕾內建的說明。';
    } finally {
      if (state.aiCtl === ctl) state.aiCtl = null;
    }
  }

  // ---------- 就吃這個（美食護照） ----------
  function eatThis() {
    const item = currentItem();
    if (!item) return;
    const ts = Date.now();
    S.passport.add({
      id: item.food.id, name: item.food.name, emoji: item.food.emoji, cat: item.food.cat,
      county: state.county, slot: state.slot, mood: state.mood, ts: ts,
    });
    $('#pick-stamp').hidden = false;
    $('#stamp-date').textContent = fmtDate(ts);
    $('#act-eat').disabled = true;
    $('#act-eat').textContent = '✅ 已蓋章';
    $('#res-arale').src = IMG('arale-wink');
    const c = countyObj();
    typeInto($('#res-text'), '蓋章完成！' + (c ? c.name + '的' : '') + '美食護照 +1，吃飽記得回來跟我說好不好吃～', 18);
    updateStampCount();
  }

  function updateStampCount() {
    const p = S.passport.load();
    $('#stamp-count').textContent = Object.keys(p.stamps).length;
  }

  function renderPassport() {
    const p = S.passport.load();
    $('#passport-title').textContent = '📒 ' + state.me + ' 的美食護照';
    buildTilemap($('#passport-map'), { stamps: p.stamps });
    const catCount = {};
    p.meals.forEach((m) => { catCount[m.cat] = (catCount[m.cat] || 0) + 1; });
    const fav = Object.keys(catCount).sort((a, b) => catCount[b] - catCount[a])[0];
    $('#pp-stats').innerHTML =
      '<div><b>' + Object.keys(p.stamps).length + '<small>/22</small></b><span>縣市章</span></div>' +
      '<div><b>' + p.meals.length + '</b><span>總餐數</span></div>' +
      '<div><b>' + (fav ? esc(D.CAT_LABELS[fav] || fav) : '—') + '</b><span>最常吃</span></div>';
    const list = $('#pp-list');
    list.innerHTML = p.meals.length ? p.meals.slice(0, 15).map((m) => {
      const c = m.county ? byId(D.COUNTIES, m.county) : null;
      const s = byId(D.SLOTS, m.slot);
      return '<li><span class="e">' + m.emoji + '</span><span>' + esc(m.name) + (c ? '・' + esc(c.short) : '') + '</span><small>' +
        fmtDate(m.ts) + ' ' + (s ? s.label : '') + '</small></li>';
    }).join('') : '<li class="pp-empty">還沒有紀錄。在推薦結果按「就吃這個」就會蓋章。</li>';
    $('#pp-confirm').hidden = true;
    $('#pp-clear').hidden = !p.meals.length;
  }

  // ---------- 命運轉盤 ----------
  const wheel = { rot: 0, spinning: false, items: [], landed: -1 };

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function drawWheel() {
    const cv = $('#wheel');
    const g = cv.getContext('2d');
    const n = wheel.items.length;
    const R = cv.width / 2;
    const seg = (Math.PI * 2) / n;
    const fills = [cssVar('--sun'), cssVar('--teal-soft'), cssVar('--sun-soft'), cssVar('--panel-2')];
    g.clearRect(0, 0, cv.width, cv.height);
    g.save();
    g.translate(R, R);
    for (let i = 0; i < n; i++) {
      const a0 = wheel.rot + i * seg - Math.PI / 2;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, R - 4, a0, a0 + seg);
      g.closePath();
      g.fillStyle = fills[i % fills.length];
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = cssVar('--line');
      g.stroke();
      g.save();
      g.rotate(a0 + seg / 2);
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.fillStyle = cssVar('--ink');
      g.font = '56px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      g.fillText(wheel.items[i].food.emoji, R - 26, 0);
      const name = wheel.items[i].food.name;
      g.font = (name.length > 5 ? 26 : 32) + 'px ' + cssVar('--font-display');
      g.fillText(name.length > 6 ? name.slice(0, 5) + '…' : name, R - 96, 2);
      g.restore();
    }
    g.beginPath();
    g.arc(0, 0, 54, 0, Math.PI * 2);
    g.fillStyle = cssVar('--panel');
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = cssVar('--line');
    g.stroke();
    g.fillStyle = cssVar('--ink');
    g.font = '40px ' + cssVar('--font-display');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('轉', 0, 2);
    g.restore();
  }

  function openWheel() {
    wheel.items = state.result.picks.slice(0, 6);
    wheel.landed = -1;
    $('#wheel-result').textContent = '按下開轉，讓命運決定！';
    $('#wheel-use').hidden = true;
    drawWheel();
    $('#dlg-wheel').showModal();
  }

  function spinWheel() {
    if (wheel.spinning || !wheel.items.length) return;
    wheel.spinning = true;
    $('#wheel-spin').disabled = true;
    $('#wheel-use').hidden = true;
    const n = wheel.items.length;
    const seg = (Math.PI * 2) / n;
    const k = Math.floor(Math.random() * n);
    const TAU = Math.PI * 2;
    const target = -(k + 0.5) * seg;
    const start = wheel.rot;
    const delta = TAU * 5 + (((target - start) % TAU) + TAU) % TAU;
    const dur = reduceMotion ? 200 : 4200;
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 4);
    function frame(now) {
      const t = Math.min(1, (now - t0) / dur);
      wheel.rot = start + delta * ease(t);
      drawWheel();
      if (t < 1) { requestAnimationFrame(frame); return; }
      wheel.rot %= TAU;
      wheel.spinning = false;
      wheel.landed = state.result.picks.indexOf(wheel.items[k]);
      $('#wheel-spin').disabled = false;
      $('#wheel-spin').textContent = '再轉一次';
      $('#wheel-result').textContent = '命運選中：' + wheel.items[k].food.emoji + ' ' + wheel.items[k].food.name + '！';
      $('#wheel-use').hidden = false;
    }
    requestAnimationFrame(frame);
  }

  // ---------- 誰買單 ----------
  function payerNames() {
    const names = [state.me].concat(state.names);
    for (let i = names.length; i < state.size; i++) names.push('飯友 ' + i);
    return names;
  }

  function openPayer() {
    const names = payerNames();
    $('#payer-names').innerHTML = names.map((n) => '<span class="chip">' + esc(n) + '</span>').join('');
    $('#payer-result').textContent = '抽出一位幸運兒請客！';
    $('#aa-total').value = '';
    $('#aa-out').textContent = '每人 $0（' + names.length + ' 人）';
    $('#dlg-payer').showModal();
  }

  async function drawPayer() {
    const chips = $$('#payer-names .chip');
    const n = chips.length;
    if (!n) return;
    const btn = $('#payer-go');
    btn.disabled = true;
    chips.forEach((c) => c.classList.remove('win', 'lit'));
    const winner = Math.floor(Math.random() * n);
    const steps = reduceMotion ? 1 : n * 3 + winner + 1;
    let at = 0;
    for (let i = 0; i < steps; i++) {
      at = i % n;
      chips.forEach((c, j) => c.classList.toggle('lit', j === at));
      await wait(50 + Math.pow(i / steps, 3) * 320);
    }
    chips.forEach((c) => c.classList.remove('lit'));
    chips[winner].classList.add('win');
    const name = chips[winner].textContent;
    $('#payer-result').textContent = name === state.me ? '恭喜 ' + name + ' 請客！錢包保重 😂' : '今天由 ' + name + ' 買單！謝謝老闆 🙏';
    btn.disabled = false;
    btn.textContent = '再抽一次';
  }

  // ---------- 美食雷達 ----------
  function fmtDist(m) {
    return m < 1000 ? Math.round(m / 10) * 10 + ' 公尺' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' 公里';
  }

  function hoursText(h) {
    if (!h) return '';
    const map = { Mo: '一', Tu: '二', We: '三', Th: '四', Fr: '五', Sa: '六', Su: '日', PH: '國定假日', off: '休息' };
    return '營業時間：' + h.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|off)\b/g, (x) => map[x]).replace(/;/g, '；');
  }

  function radarBase(radius) {
    const ringLabels = [radius / 3, (radius * 2) / 3, radius].map(fmtDist);
    return '<circle class="ring" r="33"/><circle class="ring" r="66"/><circle class="ring" r="100"/>' +
      '<line class="axis" x1="-104" y1="0" x2="104" y2="0"/><line class="axis" x1="0" y1="-104" x2="0" y2="104"/>' +
      '<text class="ring-label" x="3" y="-35">' + ringLabels[0] + '</text>' +
      '<text class="ring-label" x="3" y="-68">' + ringLabels[1] + '</text>' +
      '<text class="ring-label" x="3" y="-102">' + ringLabels[2] + '</text>' +
      '<text class="north" x="-3" y="-108">N</text>' +
      '<path class="sweep" d="M0 0 L0 -100 A100 100 0 0 1 70.7 -70.7 Z"/>' +
      '<circle class="me" r="5"/>';
  }

  async function findNearby() {
    const res = state.result;
    const item = currentItem();
    if (!item) return;
    const others = res.picks.filter((p, i) => i !== state.main).map((p) => p.food);
    const foods = [item.food].concat(others).slice(0, 6);
    const dist = byId(D.DISTANCES, state.distance);
    const c = countyObj();
    const center = state.coords ? { lat: state.coords.lat, lon: state.coords.lon, exact: true } :
      c ? { lat: c.seat[0], lon: c.seat[1], exact: false } : null;

    $('#nearby').hidden = false;
    $('#nb-title').textContent = '附近的「' + item.food.name + '」';
    $('#nb-links').innerHTML = foods.slice(0, 3).map((f) => {
      const q = f.kw.split('|')[0] + (center ? '' : c ? ' ' + c.name : '');
      return '<a class="btn small" href="' + S.mapsSearch(q, center) + '" target="_blank" rel="noopener">Google 地圖搜「' + esc(f.kw.split('|')[0]) + '」↗</a>';
    }).join('');
    const radar = $('#radar');
    radar.innerHTML = radarBase(dist.meters);
    const list = $('#nb-list');
    list.innerHTML = '';
    const stateMsg = $('#nb-state');
    $('#nearby').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });

    if (!center) {
      $('#nb-meta').textContent = '還沒有位置。';
      stateMsg.textContent = '先在第 1 格定位或選縣市，美食雷達才知道要掃哪裡。也可以直接用下面的 Google 地圖搜尋。';
      return;
    }
    $('#nb-meta').textContent = (center.exact ? '以你的位置為中心' : '以' + c.name + '市中心為中心（未定位）') + '，' + dist.icon + ' ' + dist.label + '半徑 ' + fmtDist(dist.meters);
    stateMsg.textContent = '美食雷達掃描中⋯';
    say('fired', '美食雷達啟動！幫你掃描附近的店～');
    let places;
    try {
      places = await S.nearby(center, foods, dist.meters);
    } catch (e) {
      stateMsg.textContent = '店家資料暫時抓不到（OpenStreetMap 忙碌或瀏覽環境限制），請用下面的 Google 地圖搜尋。';
      say('confused', '雷達收訊不好⋯先用 Google 地圖找找看吧！');
      return;
    }
    if (!places.length) {
      stateMsg.textContent = '半徑 ' + fmtDist(dist.meters) + ' 內的開放地圖資料沒有相符的店。試試 Google 地圖搜尋，或在第 5 格把距離改遠一點。';
      say('sad', '附近的開放地圖資料沒找到⋯Google 地圖應該會有更多！');
      return;
    }
    const perGroup = {};
    const shown = places.filter((p) => {
      perGroup[p.match] = (perGroup[p.match] || 0) + 1;
      return perGroup[p.match] <= 6;
    }).slice(0, 30);
    stateMsg.textContent = '找到 ' + places.length + ' 間相關店家，顯示最近的 ' + shown.length + ' 間。';
    say('laugh', '找到了！離你最近的' + (shown[0].match === 0 ? item.food.name : '美食') + '在 ' + fmtDist(shown[0].dist) + ' 外～');

    const scale = 100 / dist.meters;
    const cosLat = Math.cos(center.lat * Math.PI / 180);
    let lastGroup = -1;
    shown.forEach((p, i) => {
      const dx = (p.lon - center.lon) * 111320 * cosLat;
      const dy = (p.lat - center.lat) * 110540;
      let x = dx * scale;
      let y = -dy * scale;
      const len = Math.hypot(x, y);
      if (len > 104) { x = x / len * 104; y = y / len * 104; }
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x.toFixed(1));
      dot.setAttribute('cy', y.toFixed(1));
      dot.setAttribute('r', p.match === 0 ? 5.5 : 4);
      dot.setAttribute('class', 'dot ' + (p.match === 0 ? 'm0' : 'mx'));
      dot.dataset.i = i;
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = p.name + '・' + fmtDist(p.dist);
      dot.appendChild(title);
      dot.addEventListener('click', () => highlightPlace(i, true));
      radar.appendChild(dot);

      if (p.match !== lastGroup) {
        lastGroup = p.match;
        const h = document.createElement('li');
        h.className = 'nb-group';
        h.textContent = foods[p.match].emoji + ' ' + foods[p.match].name;
        list.appendChild(h);
      }
      const li = document.createElement('li');
      li.className = 'nb-item';
      li.dataset.i = i;
      li.innerHTML = '<b>' + esc(p.name) + '</b><span class="d">' + fmtDist(p.dist) + '・走路約 ' + Math.max(1, Math.round(p.dist / 75)) + ' 分</span>' +
        (p.hours ? '<span class="h">' + esc(hoursText(p.hours)) + '</span>' : '') +
        '<span class="links"><a href="' + S.mapsPlace(p) + '" target="_blank" rel="noopener">看評價 ↗</a>' +
        '<a href="' + S.mapsDirections(p, p.dist > 1500 ? 'driving' : 'walking') + '" target="_blank" rel="noopener">導航 ↗</a></span>';
      li.addEventListener('mouseenter', () => highlightPlace(i, false));
      list.appendChild(li);
    });
  }

  function highlightPlace(i, scroll) {
    $$('#radar .dot').forEach((d) => d.classList.toggle('on', Number(d.dataset.i) === i));
    $$('#nb-list .nb-item').forEach((li) => {
      const on = Number(li.dataset.i) === i;
      li.classList.toggle('on', on);
      if (on && scroll) li.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  // ---------- 飯局卡 ----------
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function wrapLines(g, text, maxWidth, maxLines) {
    const lines = [];
    let line = '';
    for (const ch of text.replace(/\n/g, '')) {
      if (g.measureText(line + ch).width > maxWidth) {
        lines.push(line);
        line = ch;
        if (lines.length === maxLines) break;
      } else {
        line += ch;
      }
    }
    if (lines.length < maxLines && line) lines.push(line);
    else if (lines.length === maxLines) lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '⋯';
    return lines;
  }

  function cardSummary() {
    const item = currentItem();
    const c = countyObj();
    const now = E.taipeiNow();
    const mood = state.mood ? byId(D.MOODS, state.mood) : null;
    const wx = state.result.ctx.weather.map((w) => w.icon + w.label).join(' ');
    return {
      item: item,
      chips: [
        c ? '📍 ' + c.name : '📍 全台',
        slotObj().icon + ' ' + slotObj().label,
        wx || '',
        mood ? '💭 ' + mood.label : '',
        state.solo ? '🧍 一個人' : '👥 ' + state.size + ' 人',
      ].filter(Boolean),
      date: now.date.replace(/-/g, '/') + ' ' + pad(now.hh) + ':' + pad(now.mm),
      text: '【今天吃這個】' + item.food.emoji + ' ' + item.food.name + (c ? '（' + c.name + '）' : '') + '\n' +
        state.narration.replace(/\n+/g, ' ') + '\n— 我在哪裡，要吃甚麼？ × 阿拉蕾 AI',
    };
  }

  async function makeCard() {
    const sum = cardSummary();
    const f = sum.item.food;
    const W = 1080;
    const H = 1350;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    const INK = '#1b2a29';
    const display = '"Huninn", "Noto Sans TC", sans-serif';
    const body = '"Noto Sans TC", "PingFang TC", sans-serif';
    try { await Promise.all([document.fonts.load('80px "Huninn"'), document.fonts.load('40px "Noto Sans TC"')]); } catch (e) { /* 用預設字體 */ }

    g.fillStyle = '#e9f4ef';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#d0e6dc';
    for (let y = 10; y < H; y += 24) for (let x = 10; x < W; x += 24) { g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill(); }

    const roundRect = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
    g.fillStyle = INK;
    roundRect(64, 64, W - 112, H - 112, 18);
    g.fill();
    g.fillStyle = '#ffffff';
    roundRect(50, 50, W - 112, H - 112, 18);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = INK;
    g.stroke();

    g.fillStyle = '#f5a524';
    roundRect(90, 92, 520, 92, 46);
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    g.font = '58px ' + display;
    g.textBaseline = 'middle';
    g.fillText('今天吃這個！', 130, 140);
    g.font = '30px "IBM Plex Mono", monospace';
    g.textAlign = 'right';
    g.fillText(sum.date, W - 100, 140);
    g.textAlign = 'left';

    g.fillStyle = '#fde8bd';
    g.beginPath();
    g.arc(W / 2, 350, 150, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(W / 2, 350, 100, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 4;
    g.stroke();
    g.lineWidth = 8;
    g.font = '132px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    g.textAlign = 'center';
    g.fillStyle = INK;
    g.fillText(f.emoji, W / 2, 358);

    g.font = (f.name.length > 6 ? 88 : 104) + 'px ' + display;
    g.fillText(f.name, W / 2, 585);
    g.font = '34px ' + body;
    g.fillStyle = '#526966';
    g.fillText(f.desc, W / 2, 655);

    // 標籤列：先分行，再讓每一行置中
    g.font = '30px ' + body;
    const rows = [[]];
    let rowW = 0;
    sum.chips.forEach((t, i) => {
      const w = g.measureText(t).width + 44;
      if (rowW + w > W - 180 && rows[rows.length - 1].length) { rows.push([]); rowW = 0; }
      rows[rows.length - 1].push({ t: t, w: w, first: i === 0 });
      rowW += w + 14;
    });
    let y = 710;
    g.lineWidth = 4;
    g.textAlign = 'left';
    rows.forEach((row, r) => {
      if (r) y += 70;
      const total = row.reduce((a, c) => a + c.w, 0) + (row.length - 1) * 14;
      let x = (W - total) / 2;
      row.forEach((c) => {
        g.fillStyle = c.first ? '#f5a524' : '#d2ede7';
        roundRect(x, y, c.w, 56, 28);
        g.fill();
        g.stroke();
        g.fillStyle = INK;
        g.fillText(c.t, x + 22, y + 30);
        x += c.w + 14;
      });
    });

    // 理由文字放在標籤下方、角色上方，行數依剩下的空間決定
    const ah = 230;
    const reasonTop = y + 104;
    const maxLines = Math.max(1, Math.min(4, Math.floor((H - 90 - ah - 16 - reasonTop) / 48) + 1));
    g.font = '34px ' + body;
    g.fillStyle = INK;
    g.textAlign = 'center';
    const reason = wrapLines(g, state.narration, W - 220, maxLines);
    reason.forEach((line, i) => g.fillText(line, W / 2, reasonTop + i * 48));

    try {
      const [allan, arale] = await Promise.all([loadImage(IMG('allan-' + (state.mood || 'calm'))), loadImage(IMG('arale-wink'))]);
      g.drawImage(allan, 90, H - 90 - ah, allan.width * ah / allan.height, ah);
      g.drawImage(arale, W - 90 - arale.width * ah / arale.height, H - 90 - ah, arale.width * ah / arale.height, ah);
    } catch (e) { /* 圖片載入失敗就不畫角色 */ }

    g.font = '28px ' + display;
    g.fillStyle = '#1d8a83';
    g.textAlign = 'center';
    g.fillText('我在哪裡，要吃甚麼？ × 阿拉蕾 AI', W / 2, H - 112);
    return cv;
  }

  async function openCard() {
    const dlg = $('#dlg-card');
    const msg = $('#card-msg');
    const sum = cardSummary();
    $('#card-text').value = sum.text;
    msg.textContent = '產生中⋯';
    $('#card-img').removeAttribute('src');
    dlg.showModal();
    try {
      const cv = await makeCard();
      const blob = await new Promise((resolve, reject) => {
        try { cv.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), 'image/png'); } catch (e) { reject(e); }
      });
      state.cardBlob = blob;
      if (state.cardUrl) URL.revokeObjectURL(state.cardUrl);
      state.cardUrl = URL.createObjectURL(blob);
      $('#card-img').src = state.cardUrl;
      msg.textContent = '';
      const file = new File([blob], 'today-food.png', { type: 'image/png' });
      $('#card-share').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    } catch (e) {
      state.cardBlob = null;
      msg.textContent = '圖片產生失敗。用本機檔案開啟時瀏覽器會擋，請改用網址（例如 GitHub Pages）開啟；文字版可以直接複製。';
    }
  }

  async function saveCard() {
    if (!state.cardBlob) return;
    const msg = $('#card-msg');
    const name = '今天吃' + currentItem().food.name + '.png';
    const dl = await S.capability('downloads');
    if (dl) {
      try {
        await dl.save({ filename: name, data: state.cardBlob });
        msg.textContent = '已下載。';
      } catch (e) {
        msg.textContent = e && e.code === 'declined' ? '已取消下載。' : '這裡無法下載，可以長按圖片另存。';
      }
      return;
    }
    const a = document.createElement('a');
    a.href = state.cardUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    msg.textContent = '已下載。';
  }

  async function shareCard() {
    if (!state.cardBlob) return;
    try {
      const file = new File([state.cardBlob], 'today-food.png', { type: 'image/png' });
      await navigator.share({ files: [file], title: '今天吃這個！', text: $('#card-text').value });
    } catch (e) {
      if (e && e.name !== 'AbortError') $('#card-msg').textContent = '這裡無法分享，請下載圖片或複製文字。';
    }
  }

  function copyCard() {
    const ta = $('#card-text');
    const msg = $('#card-msg');
    const fallback = () => { ta.focus(); ta.select(); msg.textContent = '已選取文字，請按複製。'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(() => { msg.textContent = '已複製，可以貼到 LINE 了！'; }, fallback);
    } else {
      fallback();
    }
  }

  // ---------- 交給阿拉蕾 ----------
  async function autoGo() {
    const btn = $('#auto-go');
    btn.disabled = true;
    $('#hero-bubble').textContent = '交給我！全自動判斷中⋯';
    try {
      if (!state.county) await doLocate(true);
      if (!state.mood) {
        const m = D.MOODS[Math.floor(Math.random() * D.MOODS.length)];
        state.mood = m.id;
        state.moodGuessed = true;
        renderMoods();
      }
      await analyze();
    } finally {
      btn.disabled = false;
      $('#hero-bubble').textContent = heroLine();
    }
  }

  // ---------- 小工具 ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(ts) {
    const t = E.taipeiNow(new Date(ts));
    return t.m + '/' + t.d;
  }
  function heroLine() {
    return slotObj().hello + '，' + state.me + '！肚子餓了嗎？';
  }

  function renderFestival() {
    const fests = E.activeFestivals(E.taipeiNow());
    const el = $('#festival');
    if (!fests.length) { el.hidden = true; return; }
    const f = fests[0];
    el.hidden = false;
    el.textContent = f.icon + ' ' + (f.inDays === 0 ? '今天是' + f.name + '！' : '再 ' + f.inDays + ' 天就是' + f.name + '：') + f.msg;
  }

  // ---------- 啟動 ----------
  function bind() {
    $('#locate').addEventListener('click', () => doLocate(false));
    $$('#strip button').forEach((b) => b.addEventListener('click', () => goStep(Number(b.dataset.step))));
    $$('.status .chip').forEach((b) => b.addEventListener('click', () => {
      goStep(Number(b.dataset.goto));
      $('#board').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    }));
    $('#prev').addEventListener('click', () => goStep(Math.max(0, state.step - 1)));
    $('#next').addEventListener('click', () => goStep(Math.min(4, state.step + 1)));
    $('#analyze').addEventListener('click', analyze);
    $('#auto-go').addEventListener('click', autoGo);
    $('#ana-skip').addEventListener('click', () => { if (skipAnalysis) skipAnalysis(); });

    $('#act-near').addEventListener('click', findNearby);
    $('#act-eat').addEventListener('click', eatThis);
    $('#act-wheel').addEventListener('click', openWheel);
    $('#act-payer').addEventListener('click', openPayer);
    $('#act-card').addEventListener('click', openCard);
    $('#act-reroll').addEventListener('click', () => { state.seed += 1; analyze(); });
    $('#act-edit').addEventListener('click', () => $('#board').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }));
    $('#tab-why-btn').addEventListener('click', () => selectTab('why'));
    $('#tab-audit-btn').addEventListener('click', () => selectTab('audit'));

    $('#wheel-spin').addEventListener('click', spinWheel);
    $('#wheel-use').addEventListener('click', () => {
      if (wheel.landed >= 0) setMain(wheel.landed);
      $('#dlg-wheel').close();
    });
    $('#payer-go').addEventListener('click', drawPayer);
    $('#aa-total').addEventListener('input', () => {
      const n = payerNames().length;
      const total = Number($('#aa-total').value) || 0;
      $('#aa-out').textContent = '每人 $' + Math.ceil(total / n) + '（' + n + ' 人）';
    });
    $('#open-passport').addEventListener('click', () => { renderPassport(); $('#dlg-passport').showModal(); });
    $('#pp-clear').addEventListener('click', () => { $('#pp-confirm').hidden = false; $('#pp-clear').hidden = true; });
    $('#pp-no').addEventListener('click', () => { $('#pp-confirm').hidden = true; $('#pp-clear').hidden = false; });
    $('#pp-yes').addEventListener('click', () => {
      S.passport.clear();
      renderPassport();
      updateStampCount();
      if (state.result) renderPick(currentItem());
    });
    $('#card-save').addEventListener('click', saveCard);
    $('#card-share').addEventListener('click', shareCard);
    $('#card-copy').addEventListener('click', copyCard);

    $$('dialog').forEach((dlg) => {
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
    });
  }

  function init() {
    $('#food-total').textContent = D.FOODS.length;
    buildTilemap($('#tilemap'), {});
    buildWeatherControls();
    buildMoods();
    buildCompanions();
    buildPrefs();
    bind();
    renderSlots();
    renderWeather();
    renderMoods();
    renderCompanions();
    renderPrefs();
    renderFestival();
    updateStampCount();
    $('#hero-bubble').textContent = heroLine();
    goStep(0, true);
    say('laugh', STEP_LINES[0][1]);
    paintSky();
  }

  init();
})();
