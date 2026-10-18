/*
 * Allan在哪裡，要吃甚麼？ — 美食知識庫
 *
 * 食物格式：f(名稱, emoji, 時段, 類別, 標籤, 搜尋關鍵字, 介紹, 額外)
 *   時段：b 早餐 / l 午餐 / t 下午茶 / d 晚餐 / n 消夜
 *   標籤：價位 p1(<$150) p2($150–500) p3(>$500)，其餘見 TAG_LABELS
 *   搜尋關鍵字：用 | 分隔，拿去比對 OpenStreetMap 店名與 Google 地圖搜尋
 *   額外：{ cuisine: 'OSM cuisine 值，用 | 分隔', months: [當季月份] }
 */
(function (root) {
  'use strict';

  function f(name, emoji, slots, cat, tags, kw, desc, extra) {
    extra = extra || {};
    return {
      name: name,
      emoji: emoji,
      slots: slots.replace(/\s+/g, '').split(''),
      cat: cat,
      tags: tags.split(/\s+/).filter(Boolean),
      kw: kw,
      desc: desc,
      cuisine: extra.cuisine || '',
      months: extra.months || null,
    };
  }

  // ---------- 全台都吃得到 ----------
  var GENERIC = [
    f('蛋餅', '🥚', 'b', 'breakfast', 'p1 quick classic solo vegok kids', '蛋餅|早餐', '酥皮或粉漿蛋餅，淋上醬油膏和辣椒醬', { cuisine: 'breakfast' }),
    f('燒餅油條配豆漿', '🥖', 'b n', 'breakfast', 'p1 hot classic quick vegok elder', '豆漿|燒餅', '老派早餐天團，鹹豆漿最暖胃', { cuisine: 'breakfast' }),
    f('蘿蔔糕', '🍘', 'b t', 'breakfast', 'p1 quick classic vegok soft elder', '蘿蔔糕', '煎到兩面金黃，外酥內軟'),
    f('飯糰', '🍙', 'b', 'breakfast', 'p1 quick solo energy classic', '飯糰', '紫米包油條肉鬆，扎實又抗餓'),
    f('早午餐', '🥞', 'b l t', 'western', 'p2 date treat slow light family', '早午餐|brunch|Brunch', '班尼迪克蛋配咖啡，慢慢享受', { cuisine: 'brunch|breakfast' }),
    f('早餐店吐司漢堡', '🍔', 'b', 'breakfast', 'p1 quick kids classic solo', '美而美|麥味登|拉亞|弘爺|呷尚寶|晨間廚房|早餐', '培根蛋吐司配一杯大冰奶', { cuisine: 'breakfast|sandwich' }),
    f('清粥小菜', '🍚', 'b n', 'porridge', 'p1 hot light soft elder comfort vegok healthy', '清粥|地瓜粥|小菜', '地瓜稀飯配菜脯蛋，溫柔又養胃'),
    f('燕麥優格碗', '🥣', 'b t', 'healthy', 'p2 healthy light cold veg date solo', '優格|輕食|沙拉|果昔', '高纖低脂，讓腸胃放個假', { cuisine: 'salad|juice' }),
    f('滷肉飯', '🍚', 'l d n', 'rice', 'p1 classic comfort quick solo heavy', '滷肉飯|魯肉飯|肉燥飯', '肥瘦相間的滷汁拌白飯，台灣人的靈魂食物'),
    f('牛肉麵', '🍜', 'l d', 'noodle', 'p2 hot soup beef comfort classic solo', '牛肉麵', '紅燒或清燉，一碗就療癒', { cuisine: 'noodle|noodles|beef_noodle' }),
    f('排骨便當', '🍱', 'l d', 'bento', 'p1 quick solo classic cowork energy delivery', '便當|飯包|悟饕', '炸排骨配三樣菜，上班族的好朋友'),
    f('自助餐', '🥗', 'l d', 'bento', 'p1 quick solo cowork healthy vegok classic', '自助餐', '想吃什麼夾什麼，營養均衡又省錢'),
    f('日式拉麵', '🍜', 'l d n', 'japanese', 'p2 hot soup comfort solo heavy', '拉麵|ラーメン|らーめん|一蘭|麵屋', '濃郁豚骨湯頭配溏心蛋', { cuisine: 'ramen' }),
    f('鍋燒意麵', '🍲', 'l d n', 'noodle', 'p1 hot soup comfort solo kids', '鍋燒|意麵', '熱騰騰一鍋，配料豐富又暖心'),
    f('咖哩飯', '🍛', 'l d', 'rice', 'p2 hot comfort solo kids vegok', '咖哩|カレー|Curry|curry', '濃郁咖哩淋白飯，大人小孩都愛', { cuisine: 'curry' }),
    f('義大利麵', '🍝', 'l d', 'western', 'p2 date kids family vegok', '義大利麵|義式|Pasta|pasta', '奶油、番茄還是青醬？浪漫首選', { cuisine: 'italian|pasta' }),
    f('炒飯', '🍳', 'l d n', 'rice', 'p1 quick solo classic vegok', '炒飯|快餐', '粒粒分明的蛋炒飯，簡單就是美味'),
    f('水餃鍋貼', '🥟', 'l d n', 'dumpling', 'p1 quick solo classic vegok kids', '水餃|鍋貼|餃子|八方雲集|四海遊龍', '一盤十顆配酸辣湯，快速又飽足', { cuisine: 'dumpling|dumplings' }),
    f('健康餐盒', '🥗', 'l d', 'healthy', 'p2 healthy light solo quick cowork delivery', '健康餐|餐盒|舒肥|沙拉', '舒肥雞胸配糙米，吃得飽也吃得巧', { cuisine: 'salad|healthy' }),
    f('越南河粉', '🍜', 'l d', 'sea', 'p2 soup light adventure beef hot', '越南|河粉|Pho|pho', '清爽牛骨湯配九層塔與檸檬', { cuisine: 'vietnamese' }),
    f('泰式料理', '🌶️', 'l d', 'sea', 'p2 spicy share group adventure seafood date', '泰式|泰國|打拋|Thai', '打拋豬、綠咖哩、月亮蝦餅，酸辣開胃', { cuisine: 'thai' }),
    f('韓式豆腐鍋', '🍲', 'l d', 'korean', 'p2 spicy hot soup solo comfort', '韓式|韓國|豆腐鍋|拌飯', '嫩豆腐泡在辣湯裡，小菜無限續', { cuisine: 'korean' }),
    f('日式丼飯', '🍱', 'l d', 'japanese', 'p2 quick solo classic', '丼|定食|食堂|すき家|吉野家', '牛丼、親子丼，一碗搞定', { cuisine: 'donburi' }),
    f('壽司生魚片', '🍣', 'l d', 'japanese', 'p3 cold date biz seafood treat celebrate', '壽司|生魚片|割烹|日本料理|鮨', '新鮮魚生，儀式感滿分', { cuisine: 'sushi' }),
    f('港式飲茶', '🥟', 'l t d', 'cantonese', 'p2 share family elder group biz slow soft', '港式|飲茶|點心|茶樓|燒臘', '蝦餃燒賣叉燒包，一桌慢慢聊', { cuisine: 'cantonese|dim_sum' }),
    f('蔬食料理', '🥬', 'l d', 'healthy', 'p2 veg healthy light solo date', '素食|蔬食|Vegan|vegan|素', '當季蔬菜做的創意料理，清爽無負擔', { cuisine: 'vegetarian|vegan' }),
    f('麻辣鍋', '🌶️', 'd n', 'hotpot', 'p3 hot spicy group share celebrate slow heavy', '麻辣|鴛鴦鍋|火鍋', '鴨血豆腐吃到飽，越辣越過癮', { cuisine: 'hot_pot|hotpot|sichuan' }),
    f('個人小火鍋', '🍲', 'l d n', 'hotpot', 'p2 hot soup solo comfort vegok healthy', '涮涮鍋|小火鍋|石頭火鍋|火鍋', '一人一鍋，想吃什麼自己配', { cuisine: 'hot_pot|hotpot|shabu-shabu' }),
    f('燒肉', '🥩', 'd', 'bbq', 'p3 group share celebrate treat date slow heavy', '燒肉|焼肉|燒烤', '滋滋作響的炭火燒肉，配啤酒最對味', { cuisine: 'barbecue|bbq|yakiniku' }),
    f('台式熱炒', '🍻', 'd n', 'share', 'p2 group share celebrate cowork seafood classic', '熱炒|快炒|海產', '三杯雞、炒水蓮、鹽酥蝦，一盤一百好熱鬧', { cuisine: 'seafood' }),
    f('牛排', '🥩', 'l d', 'western', 'p3 date treat celebrate biz beef', '牛排|Steak|steak', '刀叉一切粉嫩多汁，今天值得', { cuisine: 'steak_house|steak' }),
    f('薑母鴨', '🔥', 'd n', 'hotpot', 'p2 hot tonic group share soup slow', '薑母鴨|羊肉爐', '麻油老薑燉鴨肉，冷天必備的補冬'),
    f('合菜餐廳', '🥢', 'l d', 'share', 'p3 family elder biz group share classic slow', '台菜|川菜|江浙|合菜|飯館|餐館|餐廳', '圓桌一桌菜，長輩最愛的熱鬧'),
    f('韓式炸雞', '🍗', 'd n', 'fried', 'p2 fried group share treat celebrate delivery', '炸雞|Chicken|chicken', '外酥內嫩配啤酒，追劇良伴', { cuisine: 'chicken|fried_chicken' }),
    f('披薩', '🍕', 'l d n', 'western', 'p2 group share kids treat delivery', '披薩|Pizza|pizza|必勝客|達美樂', '牽絲起司，聚會分著吃最開心', { cuisine: 'pizza' }),
    f('印度咖哩', '🍛', 'l d', 'sea', 'p2 spicy adventure vegok hot', '印度|India|india', '香料燉煮的咖哩配烤餅，異國風味', { cuisine: 'indian' }),
    f('漢堡', '🍔', 'l d', 'western', 'p2 treat kids fried quick', '漢堡|Burger|burger', '厚實牛肉堡配薯條，大口咬下超滿足', { cuisine: 'burger' }),
    f('速食', '🍟', 'b l d n', 'fried', 'p1 quick kids fried delivery solo', '麥當勞|肯德基|摩斯|漢堡王|McDonald|KFC|MOS', '24 小時營業的老朋友', { cuisine: 'fast_food' }),
    f('酸菜白肉鍋', '🍲', 'd', 'hotpot', 'p2 hot soup group share family', '酸菜白肉|白肉鍋|東北', '酸香湯頭解膩又開胃'),
    f('蚵仔煎', '🦪', 'l d n', 'snack', 'p1 street nightmarket seafood classic', '蚵仔煎', 'Q 彈粉漿包著肥美鮮蚵，淋上甜辣醬'),
    f('大腸麵線', '🥣', 'b l t n', 'snack', 'p1 hot soup street quick solo', '麵線', '大腸 Q 彈、柴魚香濃，站著吃也開心'),
    f('鹹酥雞', '🍗', 't n', 'fried', 'p1 fried street treat share delivery', '鹹酥雞|鹽酥雞', '九層塔一起下鍋，配手搖飲罪惡感爆表'),
    f('滷味', '🍢', 't n', 'snack', 'p1 street solo comfort vegok', '滷味', '挑一籃喜歡的料，加辣加酸菜'),
    f('炸雞排', '🍗', 't n', 'fried', 'p1 fried street treat solo', '雞排', '比臉還大的雞排，撒上胡椒粉'),
    f('燒烤串', '🍢', 'd n', 'bbq', 'p2 group share celebrate street', '串燒|烤串|燒烤', '一串一串配啤酒，聊到深夜', { cuisine: 'yakitori' }),
    f('麻油雞', '🍗', 'd n', 'soup', 'p2 hot tonic soup comfort', '麻油雞|燒酒雞', '麻油香氣撲鼻，喝完全身暖起來'),
    f('超商泡麵加蛋', '🍜', 'b l d n', 'noodle', 'p1 quick delivery solo comfort hot', '7-ELEVEN|7-Eleven|全家|萊爾富|OK', '颱風天和深夜的救星，就在你家樓下'),
    f('臭豆腐', '🧆', 'l t d n', 'snack', 'p1 smelly street adventure vegok spicy', '臭豆腐', '外酥內嫩配台式泡菜，聞香下馬'),
    f('珍珠奶茶', '🧋', 't', 'drink', 'p1 cold sweet quick treat veg', '手搖|奶茶|珍珠|茶飲|五十嵐|清心|迷客夏|大苑子|COMEBUY|CoCo|飲料', 'Q 彈珍珠配香濃奶茶，台灣之光', { cuisine: 'bubble_tea' }),
    f('豆花', '🍮', 't n', 'sweet', 'p1 sweet light soft elder kids veg', '豆花', '滑嫩豆花加花生粉圓，冷熱都好吃'),
    f('剉冰', '🍧', 't', 'sweet', 'p1 ice cold sweet share kids veg', '剉冰|雪花冰|冰品|冰店', '滿滿配料淋上黑糖蜜，消暑第一名', { cuisine: 'ice_cream|shaved_ice' }),
    f('鬆餅甜點', '🧇', 't', 'sweet', 'p2 sweet date treat slow veg', '鬆餅|甜點|Waffle|waffle|Dessert|dessert', '鬆軟鬆餅配冰淇淋，下午茶的儀式感', { cuisine: 'dessert|cake|crepe|waffle' }),
    f('咖啡廳', '☕', 'b t', 'drink', 'p2 date biz slow sweet light veg', '咖啡|Cafe|cafe|Coffee|coffee|珈琲', '一杯手沖配一塊蛋糕，讓腳步慢下來', { cuisine: 'coffee_shop' }),
    f('雞蛋糕車輪餅', '🥮', 't', 'sweet', 'p1 street sweet kids quick veg', '雞蛋糕|車輪餅|紅豆餅', '剛出爐熱呼呼，紅豆奶油都想要'),
    f('燒仙草', '🍵', 't n', 'sweet', 'p1 hot sweet comfort veg', '仙草', '熱熱一碗配芋圓花生，冬天限定的幸福'),
    f('紅豆湯圓', '🍡', 't n', 'sweet', 'p1 hot sweet comfort soft elder veg', '湯圓|紅豆湯|甜湯|圓仔', 'Q Q 湯圓泡在紅豆湯裡，暖到心坎'),
    f('蛋塔', '🥧', 't', 'sweet', 'p1 sweet quick veg', '蛋塔|葡式', '酥脆塔皮配滑嫩蛋香', { cuisine: 'pastry' }),
    f('蔥抓餅', '🥞', 'b t', 'snack', 'p1 quick street vegok', '蔥抓餅|蔥油餅', '加蛋加起司，層層酥脆'),
    f('鹹水雞', '🐔', 't n', 'snack', 'p1 cold light healthy street', '鹹水雞', '冰涼爽口的雞肉配時蔬，熱天消夜首選'),
    f('涼麵', '🍜', 'b l', 'noodle', 'p1 cold quick light solo', '涼麵', '芝麻醬拌涼麵配味噌湯，炎夏救星'),
    f('刈包', '🍔', 'l t n', 'snack', 'p1 street classic', '刈包|割包', '控肉、酸菜、花生粉，台式漢堡'),
    f('潤餅', '🌯', 'l t', 'snack', 'p1 light healthy vegok classic', '潤餅', '薄餅包滿蔬菜和花生粉，清爽健康'),
    f('肉粽', '🍙', 'l t', 'rice', 'p1 classic', '肉粽|粽', '南部粽還是北部粽？你是哪一派'),
    f('藥燉排骨', '🍖', 'd n', 'soup', 'p1 hot tonic soup', '藥燉', '中藥香氣十足，夜市補身經典'),
    f('鐵板燒', '🍳', 'l d', 'japanese', 'p2 date treat classic', '鐵板燒', '看師傅在面前翻炒，熱鬧又好吃', { cuisine: 'teppanyaki' }),
    f('居酒屋', '🏮', 'd n', 'japanese', 'p3 group cowork share treat celebrate slow', '居酒屋|酒場', '下班來杯生啤配串燒，放鬆一下', { cuisine: 'izakaya' }),
    f('麵包烘焙', '🥐', 'b t', 'sweet', 'p1 quick sweet solo veg', '麵包|烘焙|Bakery|bakery', '剛出爐的香氣，隨手帶著走'),
    f('重陽糕麻糬', '🍡', 't', 'sweet', 'p1 sweet soft elder veg', '麻糬|和菓子|糕餅', '軟 Q 香甜的糕點，敬老又應景'),
  ];

  // ---------- 22 縣市 ----------
  // grid：在 7×9 方塊地圖上的位置 [欄, 列, 跨列]
  // pts：用來判斷 GPS 落在哪個縣市的參考點 "緯度,經度;..."
  var COUNTIES = [
    {
      id: 'KEE', name: '基隆市', short: '基隆', region: '北部', grid: [6, 0, 1],
      seat: [25.1276, 121.7392], blurb: '雨都港口，廟口夜市不打烊',
      pts: '25.128,121.739;25.095,121.713;25.100,121.740;25.120,121.720;25.150,121.770',
      foods: [
        f('營養三明治', '🥪', 't d n', 'snack', 'p1 fried street nightmarket classic', '營養三明治|廟口', '廟口夜市招牌，炸麵包夾滷蛋和小黃瓜'),
        f('鼎邊趖', '🥣', 'b l t', 'soup', 'p1 hot soup classic soft', '鼎邊趖', '米漿沿鍋邊燙成片，湯頭鮮甜'),
        f('天婦羅', '🍢', 't d n', 'snack', 'p1 fried street classic', '天婦羅|甜不辣', '現炸魚漿配小黃瓜，沾甜辣醬'),
        f('泡泡冰', '🍧', 't', 'sweet', 'p1 ice cold sweet kids veg', '泡泡冰', '冰和配料一起打到綿密，基隆獨有'),
        f('咖哩炒麵', '🍝', 'b l', 'noodle', 'p1 quick classic solo', '咖哩炒麵|炒麵', '港邊碼頭工人的早午餐，香氣十足'),
        f('崁仔頂漁港海鮮', '🦐', 'd n', 'seafood', 'p2 seafood group share celebrate adventure', '海鮮|漁港|海產|碧砂', '深夜漁市直送，現撈現煮'),
        f('豆簽羹', '🍲', 'l t', 'soup', 'p1 hot soup seafood', '豆簽', '豆簽配魷魚羹，基隆人的古早味'),
      ],
    },
    {
      id: 'TPE', name: '臺北市', short: '臺北', region: '北部', grid: [5, 0, 1],
      seat: [25.0375, 121.5637], blurb: '首都美食戰區，從米其林到夜市都有',
      pts: '25.033,121.565;25.032,121.519;25.093,121.526;25.069,121.589;25.132,121.501;24.989,121.570;25.026,121.543;25.035,121.500;25.055,121.607;25.050,121.577;25.064,121.533;25.063,121.513;25.170,121.540',
      foods: [
        f('胡椒餅', '🫓', 't d n', 'snack', 'p1 hot street nightmarket classic', '胡椒餅', '饒河夜市炭烤，咬下爆汁小心燙'),
        f('小籠包', '🥟', 'l d', 'dumpling', 'p2 classic family biz date share', '小籠包|湯包|鼎泰豐', '十八摺薄皮包著熱湯，台北名片'),
        f('永康街芒果冰', '🥭', 't', 'sweet', 'p2 ice cold sweet share date veg', '芒果冰|冰館', '整顆芒果堆成山，觀光客也搶著吃', { months: [5, 6, 7, 8, 9] }),
        f('阜杭厚餅夾蛋', '🥖', 'b', 'breakfast', 'p1 hot classic', '阜杭|豆漿|厚餅', '排隊也甘願的燒餅厚餅配鹹豆漿'),
        f('士林夜市大雞排', '🍗', 'd n', 'fried', 'p1 fried street nightmarket treat', '雞排|士林', '比臉大的雞排，夜市散步必備'),
        f('阿宗麵線', '🥣', 'l t n', 'snack', 'p1 hot soup street quick', '麵線|阿宗', '西門町站著吃的大腸麵線'),
        f('寧夏夜市小吃巡禮', '🏮', 'd n', 'snack', 'p1 nightmarket street group share adventure', '寧夏|夜市', '豬肝湯、蚵仔煎、芋餅，一路吃過去'),
        f('川味紅油抄手', '🥟', 'l d', 'dumpling', 'p1 spicy classic solo', '抄手|紅油|川味', '眷村口味的紅油抄手，香辣過癮'),
      ],
    },
    {
      id: 'NTP', name: '新北市', short: '新北', region: '北部', grid: [5, 1, 1],
      seat: [25.012, 121.4657], blurb: '山城老街和海港，一路吃不完',
      pts: '25.012,121.466;25.036,121.450;25.062,121.487;24.999,121.499;24.968,121.538;25.169,121.441;25.067,121.661;24.934,121.369;25.109,121.806;25.222,121.637;25.077,121.391;24.991,121.420;24.972,121.444;25.008,121.516;25.085,121.474;24.955,121.354;24.865,121.550;24.937,121.711;24.991,121.659;25.022,121.909;25.147,121.398;25.002,121.616;25.026,121.739;25.240,121.500',
      foods: [
        f('淡水阿給', '🥟', 'l t', 'snack', 'p1 classic hot', '阿給', '油豆腐塞冬粉，淋上甜辣醬'),
        f('淡水魚丸湯', '🍥', 'l t', 'soup', 'p1 hot soup seafood quick', '魚丸', '包肉燥的魚丸，Q 彈有勁'),
        f('深坑臭豆腐', '🧆', 'l t d', 'snack', 'p1 smelly adventure spicy vegok', '臭豆腐|深坑', '麻辣、清蒸、碳烤，臭豆腐的極致'),
        f('九份芋圓', '🍡', 't', 'sweet', 'p1 sweet soft kids veg', '芋圓|九份', '山城看海配一碗手工芋圓'),
        f('三峽金牛角', '🥐', 'b t', 'sweet', 'p1 sweet quick veg', '牛角|三峽', '老街名物，奶香酥軟'),
        f('金山鴨肉', '🦆', 'l d', 'rice', 'p1 classic share', '鴨肉|金山', '老街排隊名店，鴨肉切盤配炒麵'),
        f('烏來竹筒飯', '🎋', 'l d', 'rice', 'p2 adventure share', '竹筒飯|山豬|原住民', '泰雅風味竹筒飯配烤山豬肉'),
        f('萬里蟹', '🦀', 'd', 'seafood', 'p3 seafood celebrate treat group share', '萬里蟹|螃蟹|蟹|海鮮', '秋季限定，肥美的萬里蟹', { months: [9, 10, 11] }),
      ],
    },
    {
      id: 'TYN', name: '桃園市', short: '桃園', region: '北部', grid: [4, 1, 1],
      seat: [24.9937, 121.301], blurb: '眷村米干、客家粄條和異國小吃',
      pts: '24.994,121.301;24.965,121.225;24.946,121.218;24.928,121.284;24.907,121.146;24.880,121.287;24.993,121.338;25.046,121.292;25.064,121.196;25.033,121.083;24.972,121.106;24.864,121.216;24.820,121.352;24.700,121.400',
      foods: [
        f('大溪豆干', '🟫', 't', 'snack', 'p1 quick classic veg', '豆干|大溪', '滷得入味的老街豆干'),
        f('龍岡米干', '🍜', 'b l', 'noodle', 'p1 hot soup adventure', '米干|滇緬|雲南', '滇緬眷村的米干，酸辣過癮'),
        f('客家粄條', '🍜', 'l', 'noodle', 'p1 hot soup classic', '粄條|客家', '滑順粄條配油蔥，客家庄日常'),
        f('石門活魚', '🐟', 'l d', 'seafood', 'p2 group share family', '活魚|石門', '一魚多吃，水庫旁的家庭聚餐'),
        f('後站東南亞小吃', '🍛', 'l d', 'sea', 'p1 adventure spicy', '印尼|越南|泰式|東南亞|緬甸', '桃園後站的異國風味，像出國一趟'),
        f('拉拉山水蜜桃', '🍑', 't', 'sweet', 'p2 sweet light veg', '水蜜桃|拉拉山', '夏季限定的高山水蜜桃', { months: [6, 7, 8] }),
      ],
    },
    {
      id: 'HSZ', name: '新竹市', short: '竹市', region: '北部', grid: [3, 2, 1],
      seat: [24.8066, 120.9686], blurb: '風城米粉貢丸，城隍廟口最熱鬧',
      pts: '24.804,120.968;24.776,120.912;24.790,121.000;24.820,120.950;24.780,120.960',
      foods: [
        f('新竹米粉', '🍜', 'b l', 'noodle', 'p1 classic quick', '米粉', '九降風吹出來的炒米粉'),
        f('貢丸湯', '🍡', 'l d', 'soup', 'p1 hot soup classic kids', '貢丸', '彈牙貢丸配芹菜，風城名物'),
        f('城隍廟肉圓', '🥟', 'l t', 'snack', 'p1 classic', '肉圓|城隍廟', '新竹的蒸肉圓，皮薄透亮'),
        f('鴨肉許鴨肉飯', '🦆', 'l d', 'rice', 'p1 classic quick', '鴨肉', '鴨肉片和鴨肉飯，在地人推薦'),
        f('竹塹餅', '🥮', 't', 'sweet', 'p1 sweet', '竹塹餅|餅舖|餅店', '肥豬肉和冬瓜餡的古早味大餅'),
      ],
    },
    {
      id: 'HSQ', name: '新竹縣', short: '竹縣', region: '北部', grid: [4, 2, 1],
      seat: [24.8387, 121.0177], blurb: '客家庄風情，擂茶柿餅香',
      pts: '24.839,121.004;24.736,121.091;24.903,121.044;24.899,120.984;24.825,121.073;24.789,121.177;24.775,121.093;24.761,120.986;24.700,121.054;24.721,121.116;24.700,121.200;24.620,121.120;24.687,121.015',
      foods: [
        f('客家小炒', '🥘', 'l d', 'share', 'p2 share family group classic', '客家|小炒', '豆干、魷魚、三層肉大火快炒'),
        f('北埔擂茶', '🍵', 't', 'drink', 'p2 adventure healthy slow veg', '擂茶', '自己動手擂出香氣，配米香'),
        f('竹東粄條', '🍜', 'l', 'noodle', 'p1 soup hot classic', '粄條', '湯粄條配豬油蔥，樸實美味'),
        f('新埔柿餅', '🟠', 't', 'sweet', 'p1 sweet veg', '柿餅', '秋天曬滿整片的金黃柿餅', { months: [9, 10, 11, 12] }),
        f('內灣野薑花粽', '🍙', 'l t', 'rice', 'p1 vegok', '野薑花粽|粽', '用野薑花葉包的粽子，清香特別'),
        f('薑絲炒大腸', '🥢', 'l d', 'share', 'p2 adventure share spicy', '客家|大腸', '酸香夠味的客家下飯菜'),
      ],
    },
    {
      id: 'ILA', name: '宜蘭縣', short: '宜蘭', region: '北部', grid: [5, 2, 1],
      seat: [24.757, 121.7536], blurb: '好山好水，蔥油餅和卜肉',
      pts: '24.757,121.753;24.677,121.767;24.827,121.773;24.859,121.823;24.596,121.851;24.670,121.650;24.630,121.790;24.680,121.800;24.740,121.720;24.750,121.780;24.530,121.500;24.460,121.800',
      foods: [
        f('三星蔥油餅', '🥞', 'b t', 'snack', 'p1 quick street vegok', '蔥油餅|蔥餅', '三星蔥滿到爆出來'),
        f('卜肉', '🍖', 'd', 'fried', 'p2 fried share classic', '卜肉', '裹粉油炸的豬里肌，宜蘭辦桌菜'),
        f('糕渣', '🟨', 'd', 'fried', 'p2 adventure share', '糕渣', '外酥內滑，宜蘭獨有的古早菜'),
        f('西魯肉', '🍲', 'd', 'soup', 'p2 share family hot soup', '西魯肉', '白菜蛋酥羹，宜蘭人的辦桌湯'),
        f('鴨賞', '🦆', 'l d', 'share', 'p2 adventure', '鴨賞', '煙燻鴨肉配蒜苗，下酒好物'),
        f('牛舌餅', '🫓', 't', 'sweet', 'p1 sweet quick veg', '牛舌餅', '薄脆的宜蘭牛舌餅'),
        f('羅東夜市', '🏮', 'd n', 'snack', 'p1 nightmarket street group share', '羅東|夜市', '羊肉湯、包心粉圓，一路吃到底'),
      ],
    },
    {
      id: 'MIA', name: '苗栗縣', short: '苗栗', region: '中部', grid: [3, 3, 1],
      seat: [24.5602, 120.8214], blurb: '客家山城，草莓季最甜',
      pts: '24.560,120.821;24.688,120.903;24.686,120.873;24.613,120.787;24.489,120.677;24.442,120.653;24.422,120.864;24.413,120.774;24.597,121.000;24.499,120.823;24.310,120.820;24.490,120.790;24.570,120.850;24.540,120.920;24.440,120.900',
      foods: [
        f('苗栗客家菜', '🥘', 'l d', 'share', 'p2 family share group classic', '客家菜|客家', '梅干扣肉、薑絲大腸，一桌客家味'),
        f('大湖草莓', '🍓', 't', 'sweet', 'p1 sweet cold kids veg', '草莓', '冬春限定，草莓園現採', { months: [12, 1, 2, 3, 4] }),
        f('南庄鱒魚', '🐟', 'l d', 'seafood', 'p2 adventure share', '鱒魚|南庄', '山泉養殖的鱒魚料理'),
        f('福菜肉片湯', '🍲', 'l d', 'soup', 'p1 hot soup classic', '福菜|客家', '曬乾芥菜熬的湯，甘醇回韻'),
        f('苗栗擂茶', '🍵', 't', 'drink', 'p2 healthy slow veg', '擂茶', '客家擂茶，香濃養生'),
      ],
    },
    {
      id: 'TXG', name: '臺中市', short: '臺中', region: '中部', grid: [4, 3, 1],
      seat: [24.1618, 120.6466], blurb: '珍奶發源地，火鍋和夜市重鎮',
      pts: '24.181,120.646;24.182,120.686;24.252,120.718;24.099,120.678;24.126,120.718;24.233,120.566;24.268,120.559;24.349,120.622;24.106,120.623;24.062,120.700;24.258,120.828;24.255,121.250;24.220,120.650;24.210,120.700;24.310,120.710;24.250,120.530;24.190,120.550;24.150,120.540;24.230,120.810;24.270,120.780;24.330,120.650;24.350,120.590;24.260,120.660;24.140,120.610;24.140,120.680',
      foods: [
        f('太陽餅', '🌞', 't', 'sweet', 'p1 sweet quick', '太陽餅', '層層酥皮包麥芽糖，台中伴手禮'),
        f('春水堂珍珠奶茶', '🧋', 't', 'drink', 'p1 sweet cold quick classic veg', '春水堂|珍珠奶茶|手搖', '珍奶的故鄉，來一杯就對了', { cuisine: 'bubble_tea' }),
        f('大麵羹', '🍜', 'b l', 'noodle', 'p1 hot soup classic quick', '大麵羹', '鹼麵煮成羹，台中人的早午餐'),
        f('逢甲夜市', '🏮', 'd n', 'snack', 'p1 nightmarket group share adventure', '逢甲|夜市', '全台最大夜市，創意小吃發源地'),
        f('麻芛湯', '🥬', 'l', 'soup', 'p1 hot soup healthy adventure', '麻芛', '黃麻嫩葉煮的湯，台中限定'),
        f('廟東排骨酥麵', '🍜', 'l d', 'noodle', 'p1 hot soup classic', '排骨酥|廟東', '豐原廟東的排骨酥湯麵'),
        f('宮原眼科冰淇淋', '🍦', 't', 'sweet', 'p2 cold sweet date veg', '宮原眼科|冰淇淋', '老建築裡的華麗冰淇淋'),
      ],
    },
    {
      id: 'CHA', name: '彰化縣', short: '彰化', region: '中部', grid: [3, 4, 1],
      seat: [24.0809, 120.5385], blurb: '肉圓和爌肉飯的故鄉，鹿港小吃多',
      pts: '24.081,120.538;23.959,120.574;24.057,120.434;24.111,120.500;23.962,120.479;23.870,120.520;23.900,120.374;23.858,120.581;23.920,120.320;23.850,120.320;23.850,120.490;23.810,120.620;23.900,120.590;24.030,120.540;24.130,120.470;24.150,120.480;24.040,120.440;23.950,120.540;23.890,120.460;24.030,120.500;24.010,120.630',
      foods: [
        f('彰化肉圓', '🥟', 'l t', 'snack', 'p1 classic', '肉圓', '油炸 Q 皮包大塊豬肉，淋甜醬'),
        f('爌肉飯', '🍖', 'l d n', 'rice', 'p1 classic heavy comfort', '爌肉|焢肉|控肉', '滷到入口即化的三層肉，配筍乾'),
        f('鹿港蚵仔煎', '🦪', 'l t d', 'seafood', 'p1 seafood street classic', '蚵仔|蚵嗲', '王功鮮蚵做的蚵仔煎'),
        f('鹿港麵線糊', '🥣', 'b l', 'noodle', 'p1 hot soup soft elder', '麵線糊', '綿密麵線糊，配炸蚵嗲'),
        f('貓鼠麵', '🍜', 'l d', 'noodle', 'p1 classic', '貓鼠麵', '百年老店，名字有趣湯頭鮮'),
      ],
    },
    {
      id: 'NAN', name: '南投縣', short: '南投', region: '中部', grid: [4, 4, 2],
      seat: [23.9157, 120.6869], blurb: '日月潭與高山茶，原民風味濃',
      pts: '23.916,120.684;23.974,120.680;23.966,120.968;23.758,120.672;23.830,120.780;23.896,120.936;23.866,120.912;23.810,120.850;23.750,120.750;23.840,120.680;23.880,120.770;24.040,120.860;24.020,121.130;24.060,121.160;23.700,120.850;23.470,120.890',
      foods: [
        f('日月潭紅茶', '🫖', 't', 'drink', 'p1 light healthy veg', '紅茶|阿薩姆|日月潭', '魚池鄉的台茶十八號，紅玉香'),
        f('總統魚', '🐟', 'l d', 'seafood', 'p3 seafood group share treat', '總統魚|曲腰魚|日月潭', '日月潭的曲腰魚，清蒸最對味'),
        f('竹山番薯', '🍠', 't', 'snack', 'p1 healthy light veg', '番薯|地瓜', '竹山的地瓜點心'),
        f('埔里米粉', '🍜', 'l', 'noodle', 'p1 classic', '米粉|埔里', '好水做的埔里米粉'),
        f('凍頂烏龍茶', '🍵', 't', 'drink', 'p2 slow elder light veg', '凍頂|茶', '鹿谷凍頂烏龍，回甘悠長'),
        f('原民風味餐', '🍖', 'l d', 'share', 'p2 adventure share group', '原住民|風味餐|山地', '馬告、小米、刺蔥，山林的味道'),
      ],
    },
    {
      id: 'YUN', name: '雲林縣', short: '雲林', region: '中部', grid: [3, 5, 1],
      seat: [23.7092, 120.4313], blurb: '農業首都，北港麻油雞香',
      pts: '23.711,120.543;23.708,120.431;23.570,120.303;23.799,120.465;23.679,120.479;23.750,120.250;23.640,120.560;23.680,120.390;23.690,120.310;23.700,120.200;23.640,120.220;23.580,120.180;23.570,120.240;23.650,120.310;23.760,120.350;23.770,120.410;23.760,120.500;23.760,120.610;23.650,120.430',
      foods: [
        f('北港麻油雞', '🍗', 'd n', 'soup', 'p2 hot tonic soup comfort', '麻油雞|北港', '老店麻油雞，酒香四溢'),
        f('古坑咖啡', '☕', 't', 'drink', 'p2 slow date veg', '咖啡|古坑', '台灣咖啡的故鄉，山上喝一杯'),
        f('西螺醬油滷肉飯', '🍚', 'l d', 'rice', 'p1 classic comfort', '滷肉飯|魯肉飯|西螺', '用西螺黑豆醬油滷的肉燥'),
        f('北港煎盤粿', '🍘', 'b', 'snack', 'p1 classic', '煎盤粿', '北港朝天宮旁的古早早餐'),
        f('虎尾糖廠冰品', '🍧', 't', 'sweet', 'p1 ice cold sweet kids veg', '糖廠|冰', '糖廠枝仔冰，童年的味道'),
      ],
    },
    {
      id: 'CYI', name: '嘉義市', short: '嘉市', region: '南部', grid: [2, 6, 1],
      seat: [23.4801, 120.4491], blurb: '雞肉飯之都，文化路夜市好逛',
      pts: '23.480,120.449;23.480,120.470;23.470,120.430;23.495,120.455;23.465,120.460',
      foods: [
        f('火雞肉飯', '🍚', 'b l d n', 'rice', 'p1 classic quick solo', '雞肉飯', '火雞肉絲淋油蔥，嘉義人一天一碗'),
        f('砂鍋魚頭', '🍲', 'l d', 'hotpot', 'p2 hot soup share group', '砂鍋魚頭|魚頭', '大鍋沙茶湯底燉魚頭'),
        f('方塊酥', '🍪', 't', 'sweet', 'p1 quick sweet', '方塊酥', '層層酥脆的嘉義名產'),
        f('嘉義涼麵', '🍜', 'b l', 'noodle', 'p1 cold quick', '涼麵', '淋上美乃滋的嘉義式涼麵'),
        f('文化路夜市', '🏮', 'd n', 'snack', 'p1 nightmarket group share', '文化路|夜市', '雞肉飯、豆花、鴨肉羹，吃好吃滿'),
      ],
    },
    {
      id: 'CYQ', name: '嘉義縣', short: '嘉縣', region: '南部', grid: [3, 6, 1],
      seat: [23.4588, 120.2924], blurb: '阿里山高山茶，布袋東石海味',
      pts: '23.459,120.333;23.465,120.247;23.551,120.428;23.600,120.470;23.378,120.167;23.460,120.150;23.520,120.550;23.510,120.800;23.470,120.550;23.420,120.520;23.430,120.400;23.410,120.310;23.340,120.240;23.490,120.290;23.550,120.350;23.600,120.390;23.580,120.560;23.300,120.590;23.500,120.700',
      foods: [
        f('阿里山高山茶', '🍵', 't', 'drink', 'p2 slow elder light veg', '阿里山|高山茶|茶', '雲霧裡長大的高山烏龍'),
        f('奮起湖便當', '🍱', 'l', 'bento', 'p1 classic quick', '奮起湖|便當', '鐵路便當的經典，木盒飄香'),
        f('東石鮮蚵', '🦪', 'l d', 'seafood', 'p1 seafood share', '蚵|東石', '產地直送的肥美鮮蚵'),
        f('布袋海鮮', '🦐', 'd', 'seafood', 'p2 seafood group share celebrate', '布袋|海鮮|海產', '漁港旁現撈現煮'),
        f('民雄鵝肉', '🦢', 'l d', 'share', 'p2 share classic', '鵝肉', '鵝肉切盤配鵝油拌麵'),
        f('新港飴', '🍬', 't', 'sweet', 'p1 sweet veg', '新港飴|飴', '花生麥芽的百年糖果'),
      ],
    },
    {
      id: 'TNN', name: '臺南市', short: '臺南', region: '南部', grid: [2, 7, 1],
      seat: [22.9997, 120.227], blurb: '府城古都，小吃天堂',
      pts: '22.992,120.200;22.980,120.220;23.026,120.257;23.050,120.180;23.310,120.317;23.180,120.250;23.165,120.177;23.040,120.310;23.130,120.300;22.970,120.290;22.970,120.250;22.960,120.330;23.120,120.460;23.350,120.410;23.230,120.180;23.320,120.270;23.280,120.310;23.370,120.360;23.330,120.400;23.140,120.140;23.200,120.160;23.270,120.130;23.120,120.200;23.080,120.290;23.190,120.320;23.170,120.480;23.040,120.480;22.960,120.360;23.000,120.160',
      foods: [
        f('牛肉湯', '🥩', 'b l d n', 'soup', 'p2 hot soup beef classic', '牛肉湯', '溫體牛現切，熱湯一沖就熟'),
        f('擔仔麵', '🍜', 'l t d n', 'noodle', 'p1 hot soup classic solo', '擔仔麵', '小碗肉燥湯麵加一隻蝦，百年經典'),
        f('碗粿', '🍮', 'b l t', 'snack', 'p1 classic soft', '碗粿', '米漿蒸的碗粿，淋上蒜泥醬'),
        f('虱目魚粥', '🐟', 'b l', 'porridge', 'p1 hot soup soft seafood elder comfort', '虱目魚', '清晨現煮的虱目魚肚粥'),
        f('鱔魚意麵', '🍝', 'l d n', 'noodle', 'p1 adventure', '鱔魚', '大火快炒的鱔魚，甜酸脆口'),
        f('棺材板', '🍞', 't d n', 'snack', 'p1 fried adventure', '棺材板', '炸吐司盒裝滿奶油濃湯'),
        f('蝦捲', '🍤', 'l t', 'fried', 'p1 fried seafood', '蝦捲', '安平老店的酥炸蝦捲'),
        f('玉井芒果冰', '🥭', 't', 'sweet', 'p1 ice cold sweet share veg', '芒果冰|冰', '產地愛文芒果，夏天必吃', { months: [5, 6, 7, 8, 9] }),
        f('安平豆花', '🍮', 't n', 'sweet', 'p1 sweet light soft veg', '豆花', '綿密豆花加粉圓，府城甜湯'),
        f('筒仔米糕', '🍚', 'l d n', 'rice', 'p1 classic', '米糕', '糯米配肉燥魚鬆，淋上甜醬'),
      ],
    },
    {
      id: 'KHH', name: '高雄市', short: '高雄', region: '南部', grid: [3, 7, 1],
      seat: [22.6273, 120.3014], blurb: '港都海味，夜市與客家庄並存',
      pts: '22.622,120.312;22.678,120.294;22.646,120.320;22.627,120.357;22.728,120.326;22.565,120.355;22.590,120.320;22.640,120.280;22.620,120.280;22.600,120.270;22.797,120.295;22.860,120.260;22.900,120.180;22.880,120.330;22.870,120.400;22.790,120.360;22.760,120.310;22.730,120.350;22.700,120.350;22.660,120.360;22.600,120.400;22.500,120.390;22.690,120.430;22.888,120.483;22.897,120.542;22.940,120.460;22.970,120.540;23.080,120.590;22.990,120.630;22.890,120.660;23.160,120.760;23.220,120.700',
      foods: [
        f('旗津海鮮', '🦐', 'd', 'seafood', 'p2 seafood group share celebrate', '旗津|海鮮|海產', '渡輪過去吃現撈海鮮'),
        f('木瓜牛奶', '🥛', 't', 'drink', 'p1 cold sweet quick veg', '木瓜牛奶', '高雄人的消暑飲品'),
        f('美濃粄條', '🍜', 'l', 'noodle', 'p1 hot soup classic', '粄條|美濃', '客家庄的手工粄條'),
        f('岡山羊肉爐', '🐐', 'd n', 'hotpot', 'p2 hot tonic group share', '羊肉|岡山', '藥膳羊肉爐，冬天必補'),
        f('旗山枝仔冰', '🍌', 't', 'sweet', 'p1 cold sweet kids veg', '枝仔冰|香蕉|旗山', '香蕉之鄉的古早冰棒'),
        f('瑞豐夜市', '🏮', 'd n', 'snack', 'p1 nightmarket group share', '瑞豐|六合|夜市', '在地人最愛的夜市'),
        f('鴨肉飯', '🦆', 'l d', 'rice', 'p1 classic quick', '鴨肉', '鹽埕老店，鴨肉飯配鴨肉麵'),
        f('黑輪', '🍢', 't n', 'snack', 'p1 street classic', '黑輪', '高雄人口中的關東煮'),
      ],
    },
    {
      id: 'PIF', name: '屏東縣', short: '屏東', region: '南部', grid: [3, 8, 1],
      seat: [22.6762, 120.493], blurb: '國境之南，豬腳與黑鮪魚',
      pts: '22.672,120.488;22.550,120.542;22.466,120.449;22.002,120.744;21.946,120.797;22.585,120.600;22.610,120.560;22.430,120.510;22.370,120.590;22.070,120.710;22.020,120.840;22.260,120.660;22.780,120.500;22.740,120.490;22.830,120.600;22.750,120.570;22.680,120.530;22.580,120.540;22.590,120.480;22.540,120.460;22.490,120.510;22.420,120.550;22.340,120.370;22.710,120.650;22.750,120.730;22.590,120.630;22.370,120.630;22.200,120.700;22.130,120.770',
      foods: [
        f('萬巒豬腳', '🐷', 'l d', 'share', 'p2 heavy share classic', '豬腳|萬巒', 'Q 彈豬腳沾蒜蓉醬油'),
        f('東港黑鮪魚', '🐟', 'l d', 'seafood', 'p3 seafood treat celebrate', '鮪魚|東港|生魚片', '季節限定的黑鮪魚生魚片', { months: [4, 5, 6] }),
        f('恆春綠豆蒜', '🫘', 't', 'sweet', 'p1 sweet veg', '綠豆蒜', '去殼綠豆熬煮，冷熱皆宜'),
        f('屏東肉粿', '🍘', 'b l', 'snack', 'p1 classic', '肉粿', '在地人的早餐肉粿'),
        f('墾丁大街', '🏮', 'd n', 'snack', 'p1 nightmarket group share', '墾丁|大街|夜市', '度假氣氛的夜市大街'),
        f('潮州冷熱冰', '🍧', 't', 'sweet', 'p1 sweet veg', '冷熱冰|燒冷冰', '熱湯圓配冰沙，冷熱一次滿足'),
        f('原民吉拿富', '🍃', 'l', 'rice', 'p1 adventure', '吉拿富|原住民|阿拜', '假酸漿葉包小米，排灣族風味'),
      ],
    },
    {
      id: 'HUA', name: '花蓮縣', short: '花蓮', region: '東部', grid: [5, 3, 3],
      seat: [23.9871, 121.6015], blurb: '山海之間，扁食麻糬好味道',
      pts: '23.977,121.604;23.970,121.570;24.130,121.640;23.870,121.510;23.740,121.450;23.670,121.420;23.500,121.380;23.330,121.310;23.180,121.250;24.120,121.620;24.160,121.490;23.710,121.410;23.350,121.300;23.600,121.520',
      foods: [
        f('花蓮扁食', '🥟', 'l d n', 'dumpling', 'p1 hot soup classic quick', '扁食', '只賣扁食的老店，湯清肉鮮'),
        f('公正包子', '🥟', 'b t', 'dumpling', 'p1 quick classic', '包子', '24 小時熱騰騰的小籠包和蒸餃'),
        f('炸彈蔥油餅', '🥞', 't', 'snack', 'p1 fried street', '蔥油餅', '整顆半熟蛋包在裡面'),
        f('花蓮麻糬', '🍡', 't', 'sweet', 'p1 sweet soft veg', '麻糬', '軟 Q 的花蓮麻糬'),
        f('阿美族風味餐', '🍲', 'l d', 'share', 'p2 adventure group share', '原住民|阿美|風味餐|石頭火鍋', '石頭火鍋和野菜，部落滋味'),
        f('剝皮辣椒雞湯', '🌶️', 'l d', 'soup', 'p2 hot soup spicy', '剝皮辣椒|雞湯', '微辣回甘的花蓮特色雞湯'),
        f('東大門夜市', '🏮', 'd n', 'snack', 'p1 nightmarket group share', '東大門|夜市', '原住民一條街和各省小吃'),
      ],
    },
    {
      id: 'TTT', name: '臺東縣', short: '臺東', region: '東部', grid: [4, 6, 2],
      seat: [22.7583, 121.1444], blurb: '慢活後山，池上米與釋迦',
      pts: '22.756,121.150;23.100,121.220;23.050,121.170;22.910,121.140;23.100,121.370;22.610,121.010;22.340,120.890;22.660,121.490;22.040,121.550;22.790,121.080;22.970,121.300;23.320,121.450;22.900,121.080;22.600,120.970;22.300,120.880',
      foods: [
        f('池上便當', '🍱', 'l d', 'bento', 'p1 classic quick', '池上|便當', '池上米做的便當，粒粒飽滿'),
        f('臺東釋迦', '🍈', 't', 'sweet', 'p1 healthy sweet veg', '釋迦', '綿密香甜的大目釋迦', { months: [8, 9, 10, 11, 12, 1, 2, 3] }),
        f('米苔目', '🍜', 'l', 'noodle', 'p1 hot soup classic', '米苔目', '臺東人的家常米苔目'),
        f('卑南豬血湯', '🍲', 'l t n', 'soup', 'p1 hot soup classic', '豬血湯', '料多實在的老字號'),
        f('部落小米料理', '🌾', 'l d', 'share', 'p2 adventure', '原住民|小米|風味餐', '小米、阿拜、野菜，部落餐桌'),
        f('成功旗魚', '🐟', 'l d', 'seafood', 'p2 seafood', '旗魚|成功', '成功漁港的旗魚料理'),
      ],
    },
    {
      id: 'PEN', name: '澎湖縣', short: '澎湖', region: '離島', grid: [1, 5, 1],
      seat: [23.5711, 119.5793], blurb: '菊島海味，仙人掌冰消暑',
      pts: '23.566,119.578;23.580,119.660;23.660,119.600;23.600,119.510;23.360,119.500;23.210,119.430',
      foods: [
        f('澎湖海鮮', '🦑', 'd', 'seafood', 'p2 seafood group share', '海鮮|小管|海產', '小管、石蚵、海菜，現撈最鮮'),
        f('仙人掌冰', '🌵', 't', 'sweet', 'p1 ice cold sweet adventure veg', '仙人掌', '紫紅色的酸甜仙人掌冰'),
        f('黑糖糕', '🟫', 't', 'sweet', 'p1 sweet veg', '黑糖糕', '濕潤彈牙的澎湖名產'),
        f('花枝丸', '🦑', 't d', 'snack', 'p1 fried seafood', '花枝', '大塊花枝打成的花枝丸'),
        f('海膽炒飯', '🍳', 'l d', 'rice', 'p2 seafood adventure', '海膽', '季節限定的海膽料理', { months: [4, 5, 6, 7] }),
      ],
    },
    {
      id: 'KIN', name: '金門縣', short: '金門', region: '離島', grid: [0, 3, 1],
      seat: [24.4493, 118.3767], blurb: '戰地風情，廣東粥配燒餅',
      pts: '24.433,118.318;24.440,118.420;24.490,118.410;24.450,118.330;24.430,118.240',
      foods: [
        f('廣東粥', '🥣', 'b', 'porridge', 'p1 hot soft elder comfort', '廣東粥', '米熬到化開的綿密粥品'),
        f('蚵仔麵線', '🦪', 'b l t', 'noodle', 'p1 hot soup seafood', '蚵仔麵線|麵線', '金門石蚵配紅麵線'),
        f('金門貢糖', '🥜', 't', 'sweet', 'p1 sweet veg', '貢糖', '花生香酥的金門伴手禮'),
        f('金門燒餅', '🫓', 'b t', 'snack', 'p1 quick', '燒餅', '外酥內軟的金門燒餅'),
        f('蚵嗲', '🦪', 't', 'fried', 'p1 fried seafood', '蚵嗲', '酥炸蚵仔餅，現炸最香'),
      ],
    },
    {
      id: 'LIE', name: '連江縣', short: '馬祖', region: '離島', grid: [0, 0, 1],
      seat: [26.1505, 119.9499], blurb: '馬祖閩東味，繼光餅和老酒',
      pts: '26.152,119.944;26.220,120.000;26.370,120.490;25.970,119.940',
      foods: [
        f('繼光餅', '🥯', 'b t', 'snack', 'p1 quick classic', '繼光餅', '馬祖漢堡，夾蛋夾肉都好吃'),
        f('馬祖魚麵', '🐟', 'l d', 'noodle', 'p1 hot soup seafood', '魚麵', '魚漿做成的麵條，鮮味十足'),
        f('老酒麵線', '🍶', 'l d', 'noodle', 'p2 hot tonic soup', '老酒|麵線', '老酒燉雞配麵線，暖身補氣'),
        f('紅糟料理', '🍖', 'l d', 'share', 'p2 adventure share', '紅糟', '閩東紅糟燒肉、紅糟鰻'),
        f('鼎邊糊', '🥣', 'b l', 'soup', 'p1 hot soup', '鼎邊糊', '米漿鍋邊糊，馬祖早餐'),
        f('馬祖淡菜', '🦪', 'd', 'seafood', 'p2 seafood', '淡菜|海鮮', '飽滿肥美的淡菜'),
      ],
    },
  ];

  // ---------- 時段 ----------
  var SLOTS = [
    { id: 'b', label: '早餐', icon: '🌅', from: 5 * 60, hello: '早安' },
    { id: 'l', label: '午餐', icon: '☀️', from: 10 * 60 + 30, hello: '午安' },
    { id: 't', label: '下午茶', icon: '🍰', from: 14 * 60, hello: '下午好' },
    { id: 'd', label: '晚餐', icon: '🌆', from: 17 * 60, hello: '晚安' },
    { id: 'n', label: '消夜', icon: '🌙', from: 21 * 60, hello: '夜深了' },
  ];

  // ---------- 心情（對應 Allan 九宮格表情） ----------
  var MOODS = [
    { id: 'calm', label: '心情不錯', sub: '平平順順的一天', w: { classic: 6, share: 3, sweet: 3 }, phrase: '看你心情不錯', arale: 'laugh', say: '心情好吃什麼都香！' },
    { id: 'joy', label: '超開心', sub: '想慶祝一下', w: { celebrate: 18, treat: 8, group: 4, bbq: 6, seafood: 4 }, phrase: '你今天超嗨', arale: 'laugh', say: '耶！今天要好好慶祝！' },
    { id: 'unsure', label: '選擇障礙', sub: '都可以⋯吧？', w: { classic: 14, quick: 3 }, phrase: '選擇障礙又發作了吧', arale: 'think', say: '交給我，我最會選了！' },
    { id: 'curious', label: '想嘗鮮', sub: '來點沒吃過的', w: { adventure: 18, local: 12, classic: -5 }, phrase: '你想來點新鮮的', arale: 'surprise', say: '來點新鮮的！我找找在地特色～' },
    { id: 'busy', label: '忙到爆', sub: '快狠準解決', w: { quick: 22, solo: 4, slow: -25 }, phrase: '你忙到沒時間', arale: 'explain', say: '了解，快狠準模式啟動！' },
    { id: 'stressed', label: '壓力山大', sub: '需要發洩一下', w: { spicy: 14, comfort: 8, fried: 8, sweet: 6 }, phrase: '壓力有點大', arale: 'fired', say: '壓力就用美食打倒它！' },
    { id: 'sad', label: '心情低落', sub: '需要被療癒', w: { comfort: 20, soup: 8, sweet: 10, hot: 5 }, phrase: '心情低落的時候', arale: 'sad', say: '抱抱～阿拉蕾幫你找療癒系的。' },
    { id: 'treat', label: '想犒賞自己', sub: '今天我最大', w: { treat: 20, p3: 6, sweet: 6, healthy: -6 }, phrase: '今天就該犒賞自己', arale: 'wink', say: '就是今天！對自己好一點～' },
    { id: 'tired', label: '累到傻眼', sub: '只想好好吃一頓', w: { energy: 12, soup: 8, comfort: 8, quick: 6, slow: -8 }, phrase: '你累壞了吧', arale: 'think', say: '辛苦了～來點能補充體力的。' },
  ];

  // ---------- 飯友 ----------
  var COMPANIONS = [
    { id: 'friends', label: '好朋友', icon: '🙌', w: { group: 10, share: 8, nightmarket: 6, celebrate: 4 } },
    { id: 'date', label: '約會', icon: '💕', w: { date: 20, treat: 4, smelly: -30, messy: -10 } },
    { id: 'family', label: '家人', icon: '🏠', w: { family: 15, share: 8 } },
    { id: 'cowork', label: '同事', icon: '💼', w: { cowork: 12, quick: 4, share: 4 } },
    { id: 'client', label: '客戶', icon: '🤝', w: { biz: 22, p3: 6, smelly: -30, street: -20, nightmarket: -25, messy: -12 } },
    { id: 'elder', label: '長輩', icon: '👴', w: { elder: 15, soft: 8, spicy: -15, fried: -6 } },
    { id: 'kids', label: '小朋友', icon: '🧒', w: { kids: 15, spicy: -25, smelly: -10 } },
  ];
  var SOLO = { id: 'solo', label: '一個人', icon: '🧍', w: { solo: 12, group: -18, share: -8 } };

  // ---------- 天氣 ----------
  var WEATHER = [
    { id: 'scorch', label: '熱到融化', icon: '🥵', phrase: '外面熱到快融化', w: { cold: 18, ice: 25, light: 6, hot: -12, hotpot: -15, tonic: -35, heavy: -6 } },
    { id: 'hot', label: '炎熱', icon: '☀️', phrase: '天氣有點熱', w: { cold: 12, ice: 16, light: 4, hot: -5, hotpot: -8, tonic: -25 } },
    { id: 'nice', label: '舒適', icon: '🌤️', phrase: '天氣很舒服', w: { light: 2 } },
    { id: 'cool', label: '涼爽', icon: '🍂', phrase: '天氣涼涼的', w: { hot: 8, soup: 6, hotpot: 6, tonic: 4, ice: -12 } },
    { id: 'cold', label: '寒冷', icon: '🥶', phrase: '外面冷吱吱', w: { hot: 15, soup: 12, hotpot: 18, tonic: 22, ice: -40, cold: -20 } },
    { id: 'rain', label: '下雨', icon: '🌧️', phrase: '外面在下雨', w: { soup: 10, hot: 6, comfort: 6, quick: 4, delivery: 6, nightmarket: -14, street: -6, ice: -8 } },
    { id: 'storm', label: '颱風', icon: '🌀', phrase: '颱風天', w: { delivery: 30, quick: 8, comfort: 6, nightmarket: -40, street: -20, slow: -10, group: -6 } },
  ];

  // ---------- 偏好 ----------
  var BUDGETS = [
    { id: 1, label: '小資', hint: '$150 內' },
    { id: 2, label: '剛好', hint: '$150–500' },
    { id: 3, label: '豪華', hint: '$500 以上' },
  ];
  var DIETS = [
    { id: 'veg', label: '素食' },
    { id: 'nospicy', label: '不吃辣' },
    { id: 'nobeef', label: '不吃牛' },
    { id: 'noseafood', label: '不吃海鮮' },
    { id: 'light', label: '清淡減脂' },
  ];
  var DISTANCES = [
    { id: 'walk', label: '走路', icon: '🚶', meters: 800 },
    { id: 'scooter', label: '騎車', icon: '🛵', meters: 3000 },
    { id: 'car', label: '開車', icon: '🚗', meters: 8000 },
  ];

  // ---------- 節日與節氣（國曆日期；農曆節日已換算到 2028） ----------
  // boost：加分的食物名稱；w：加分的標籤
  var FESTIVALS = [
    { name: '尾牙', icon: '🧧', dates: ['2027-01-23', '2028-01-12', '2029-01-30'], boost: ['刈包', '台式熱炒'], w: { celebrate: 8 }, msg: '來個刈包，把一年的壞運包起來！' },
    { name: '除夕', icon: '🧨', dates: ['2027-02-05', '2028-01-25'], boost: ['合菜餐廳', '個人小火鍋', '麻辣鍋'], w: { family: 12 }, msg: '團圓圍爐吃年夜飯！' },
    { name: '元宵節', icon: '🏮', dates: ['2027-02-20', '2028-02-09'], boost: ['紅豆湯圓'], w: {}, msg: '吃碗湯圓團團圓圓～' },
    { name: '西洋情人節', icon: '💝', dates: ['02-14'], boost: ['牛排', '鬆餅甜點'], w: { date: 15 }, msg: '選間有氣氛的餐廳吧！' },
    { name: '清明節', icon: '🌿', dates: ['2027-04-05', '2028-04-04'], boost: ['潤餅'], w: {}, msg: '吃潤餅是傳統喔。' },
    { name: '端午節', icon: '🐉', dates: ['2027-06-09', '2028-05-28'], boost: ['肉粽', '內灣野薑花粽'], w: {}, msg: '南部粽北部粽選一個！' },
    { name: '七夕', icon: '🌌', dates: ['2027-08-08', '2028-08-26'], boost: [], w: { date: 15 }, msg: '約會要浪漫一點～' },
    { name: '中秋節', icon: '🥮', dates: ['2027-09-15', '2028-10-03'], boost: ['燒烤串', '燒肉'], w: { bbq: 15 }, msg: '就是要烤肉！' },
    { name: '重陽節', icon: '🏔️', dates: ['2026-10-18', '2027-10-08', '2028-10-26'], boost: ['重陽糕麻糬', '港式飲茶', '合菜餐廳'], w: { elder: 10 }, msg: '重陽敬老，帶長輩吃頓好的吧！' },
    { name: '萬聖節', icon: '🎃', dates: ['10-31'], boost: ['鬆餅甜點'], w: { sweet: 6 }, msg: '不給糖就搗蛋！來點甜的～' },
    { name: '立冬', icon: '🍲', dates: ['2026-11-07', '2027-11-07', '2028-11-07'], boost: ['薑母鴨', '麻油雞', '岡山羊肉爐', '北港麻油雞', '藥燉排骨'], w: { tonic: 20 }, msg: '要補冬，薑母鴨麻油雞走起！' },
    { name: '冬至', icon: '🍡', dates: ['2026-12-22', '2027-12-22', '2028-12-21'], boost: ['紅豆湯圓'], w: {}, msg: '吃湯圓，又長大一歲囉。' },
    { name: '聖誕節', icon: '🎄', dates: ['12-25'], boost: ['牛排', '披薩'], w: { celebrate: 8 }, msg: 'Merry Christmas！吃頓大餐吧！' },
    { name: '跨年夜', icon: '🎆', dates: ['12-31'], boost: ['麻辣鍋', '燒肉'], w: { celebrate: 10 }, msg: '吃飽才有力氣倒數！' },
  ];

  // 標籤的中文說明（推薦理由用）
  var TAG_LABELS = {
    hot: '熱食', cold: '清涼', ice: '冰品', soup: '熱湯', spicy: '辣', sweet: '甜點', quick: '快速',
    slow: '慢慢吃', celebrate: '慶祝感', treat: '犒賞', share: '分享', group: '多人', solo: '一人友善',
    date: '約會氛圍', biz: '商務體面', family: '闔家', kids: '小孩友善', elder: '長輩友善', soft: '好咀嚼',
    healthy: '健康', light: '清爽', heavy: '重口味', fried: '炸物', tonic: '進補', nightmarket: '夜市',
    street: '路邊攤', smelly: '氣味強烈', messy: '吃相狼狽', adventure: '新奇', classic: '經典',
    local: '在地', energy: '補體力', delivery: '外送友善', seafood: '海鮮', beef: '牛肉',
    comfort: '療癒', cowork: '同事聚餐', p3: '高價位', bbq: '燒烤', hotpot: '火鍋',
  };

  var CAT_LABELS = {
    breakfast: '早餐', noodle: '麵食', rice: '飯類', soup: '湯品', hotpot: '鍋物', snack: '小吃',
    sweet: '甜點', drink: '飲品', bbq: '燒烤', seafood: '海鮮', western: '西式', japanese: '日式',
    korean: '韓式', sea: '異國', cantonese: '港式', bento: '便當', dumpling: '餃類', porridge: '粥品',
    fried: '炸物', share: '合菜', healthy: '輕食',
  };

  // 組合成單一食物清單（每道菜有唯一 id）
  var FOODS = [];
  GENERIC.forEach(function (x) {
    x.id = 'tw:' + x.name;
    x.county = null;
    FOODS.push(x);
  });
  COUNTIES.forEach(function (c) {
    c.anchors = c.pts.split(';').map(function (p) { return p.split(',').map(Number); });
    c.foods.forEach(function (x) {
      x.id = c.id + ':' + x.name;
      x.county = c.id;
      if (x.tags.indexOf('local') < 0) x.tags.push('local');
      FOODS.push(x);
    });
  });

  root.WTE = root.WTE || {};
  root.WTE.DATA = {
    COUNTIES: COUNTIES, FOODS: FOODS, SLOTS: SLOTS, MOODS: MOODS, COMPANIONS: COMPANIONS, SOLO: SOLO,
    WEATHER: WEATHER, BUDGETS: BUDGETS, DIETS: DIETS, DISTANCES: DISTANCES, FESTIVALS: FESTIVALS,
    TAG_LABELS: TAG_LABELS, CAT_LABELS: CAT_LABELS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
