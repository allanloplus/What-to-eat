/*
 * 對外服務：定位、天氣（Open-Meteo）、附近店家（OpenStreetMap Overpass）、
 * 本機儲存（美食護照）與 Claude（只在 claude.ai Artifact 內可用）。
 *
 * 隱私設計：座標只在瀏覽器裡用；送出前先四捨五入——天氣到小數 2 位（約 1 公里），
 * 店家到小數 3 位（約 100 公尺）；不送到任何自家伺服器，也不寫進本機儲存。
 */
(function (root) {
  'use strict';

  function withTimeout(ms) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, ms);
    return { signal: ctl.signal, done: function () { clearTimeout(timer); } };
  }

  function round(n, dp) {
    var k = Math.pow(10, dp);
    return Math.round(n * k) / k;
  }

  // ---------- 定位 ----------
  function locate() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject(new Error('unsupported')); return; }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy });
        },
        function (err) { reject(err); },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      );
    });
  }

  // ---------- 天氣 ----------
  function weather(lat, lon) {
    var t = withTimeout(8000);
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + round(lat, 2) + '&longitude=' + round(lon, 2) +
      '&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day&timezone=Asia%2FTaipei';
    return fetch(url, { signal: t.signal })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!json || !json.current) throw new Error('no data');
        return json.current;
      })
      .finally(t.done);
  }

  // ---------- 附近店家 ----------
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  // 太籠統的 cuisine 不拿去伺服器篩選，否則一個「chinese」就會撈回整條街
  var BROAD_CUISINE = ['chinese', 'taiwanese', 'regional', 'asian', 'japanese', 'american', 'fast_food', 'local'];

  function keywordsOf(food) {
    return food.kw.split('|').map(function (k) { return k.trim(); }).filter(Boolean);
  }
  function cuisinesOf(food) {
    return food.cuisine ? food.cuisine.split('|').filter(Boolean) : [];
  }
  // 先做 regex 跳脫，再做 Overpass QL 字串跳脫（反斜線要再加倍）
  function reEscape(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function buildQuery(foods, lat, lon, radius) {
    var names = [];
    var cuisines = [];
    foods.forEach(function (food) {
      keywordsOf(food).forEach(function (k) { if (names.indexOf(k) < 0) names.push(k); });
      cuisinesOf(food).forEach(function (c) {
        if (BROAD_CUISINE.indexOf(c) < 0 && cuisines.indexOf(c) < 0) cuisines.push(c);
      });
    });
    var around = '(around:' + radius + ',' + round(lat, 3) + ',' + round(lon, 3) + ')';
    var nameRe = names.map(reEscape).join('|');
    var lines = [
      'nwr["amenity"~"^(restaurant|fast_food|cafe|food_court|ice_cream|bar|pub)$"]["name"~"' + nameRe + '",i]' + around + ';',
      'nwr["shop"~"^(bakery|pastry|beverages|tea|coffee|confectionery|convenience|deli)$"]["name"~"' + nameRe + '",i]' + around + ';',
    ];
    if (cuisines.length) {
      lines.push('nwr["amenity"~"^(restaurant|fast_food|cafe|food_court|ice_cream)$"]["cuisine"~"' + cuisines.map(reEscape).join('|') + '"]' + around + ';');
    }
    return '[out:json][timeout:25];\n(\n' + lines.join('\n') + '\n);\nout center tags 300;';
  }

  // 每間店歸給「排名最前面」且名稱或 cuisine 對得上的那道菜
  function classify(el, foods) {
    var tags = el.tags || {};
    var name = tags.name || tags['name:zh'] || '';
    var lower = name.toLowerCase();
    var cuis = (tags.cuisine || '').split(';').map(function (c) { return c.trim(); });
    for (var i = 0; i < foods.length; i++) {
      var hit = keywordsOf(foods[i]).some(function (k) { return lower.indexOf(k.toLowerCase()) >= 0; }) ||
        cuisinesOf(foods[i]).some(function (c) { return cuis.indexOf(c) >= 0; });
      if (hit) return i;
    }
    return -1;
  }

  function postOverpass(query, idx) {
    var t = withTimeout(25000);
    return fetch(OVERPASS[idx], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
      signal: t.signal,
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).finally(t.done).catch(function (err) {
      if (idx + 1 < OVERPASS.length) return postOverpass(query, idx + 1);
      throw err;
    });
  }

  function nearby(center, foods, radius) {
    var query = buildQuery(foods, center.lat, center.lon, radius);
    var haversine = root.WTE.engine.haversine;
    return postOverpass(query, 0).then(function (json) {
      var seen = {};
      var places = [];
      (json.elements || []).forEach(function (el) {
        var lat = el.lat != null ? el.lat : el.center && el.center.lat;
        var lon = el.lon != null ? el.lon : el.center && el.center.lon;
        var tags = el.tags || {};
        var name = tags.name || tags['name:zh'];
        if (lat == null || !name) return;
        var key = name + '@' + lat.toFixed(4) + ',' + lon.toFixed(4);
        if (seen[key]) return;
        seen[key] = true;
        var match = classify(el, foods);
        if (match < 0) return;
        places.push({
          name: name,
          lat: lat,
          lon: lon,
          match: match,
          dist: haversine([center.lat, center.lon], [lat, lon]),
          hours: tags.opening_hours || '',
          cuisine: tags.cuisine || '',
        });
      });
      places.sort(function (a, b) { return a.match - b.match || a.dist - b.dist; });
      return places;
    });
  }

  // ---------- 連結 ----------
  function mapsSearch(query, center) {
    if (center) {
      return 'https://www.google.com/maps/search/' + encodeURIComponent(query) + '/@' +
        round(center.lat, 4) + ',' + round(center.lon, 4) + ',15z';
    }
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
  }
  function mapsPlace(place) {
    return 'https://www.google.com/maps/search/' + encodeURIComponent(place.name) + '/@' +
      place.lat.toFixed(5) + ',' + place.lon.toFixed(5) + ',18z';
  }
  function mapsDirections(place, mode) {
    return 'https://www.google.com/maps/dir/?api=1&destination=' + place.lat.toFixed(5) + '%2C' +
      place.lon.toFixed(5) + '&travelmode=' + (mode || 'walking');
  }

  // ---------- 本機儲存 ----------
  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 無痕模式等情況就不存 */ }
    },
    remove: function (key) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
  };

  var PASSPORT_KEY = 'wte.passport.v1';
  var passport = {
    load: function () {
      var p = store.get(PASSPORT_KEY, null);
      return p && Array.isArray(p.meals) ? p : { meals: [], stamps: {} };
    },
    add: function (entry) {
      var p = passport.load();
      p.meals.unshift(entry);
      p.meals = p.meals.slice(0, 200);
      if (entry.county && !p.stamps[entry.county]) p.stamps[entry.county] = entry.ts;
      store.set(PASSPORT_KEY, p);
      return p;
    },
    clear: function () {
      store.remove(PASSPORT_KEY);
    },
  };

  // ---------- claude.ai Artifact 執行環境 ----------
  var capCache = {};
  function capability(name) {
    if (!root.claude || typeof root.claude.use !== 'function') return Promise.resolve(null);
    if (!capCache[name]) {
      capCache[name] = Promise.resolve()
        .then(function () { return root.claude.use(name); })
        .catch(function () { return null; });
    }
    return capCache[name];
  }

  root.WTE.svc = {
    locate: locate, weather: weather, nearby: nearby, buildQuery: buildQuery, classify: classify,
    mapsSearch: mapsSearch, mapsPlace: mapsPlace, mapsDirections: mapsDirections,
    store: store, passport: passport, capability: capability, round: round,
  };
})(typeof window !== 'undefined' ? window : globalThis);
