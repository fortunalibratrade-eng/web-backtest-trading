(function(){
  "use strict";

  /* ============================================================
     STATE
     ============================================================ */
  const library = {};              // library[symbol][timeframe] = {n,time,open,high,low,close,volume,from,to}
  const TF_ORDER = ["M1","M5","M15","M30","H1","H4","D1","W1"];
  let screens = [];                // {id, symbol, timeframe, view:{end,count}, replay:{active,index,playing,timer}}
  let activeScreenId = null;
  let nextScreenId = 1;
  let pickMode = false;            // pick candle to start replay from
  let pendingPickMode = false;     // pick a chart price for the pending-order ticket
  let hoverIndex = null;           // index under mouse (crosshair)
  let hoverPriceY = null;          // mouse Y (px) while hovering the chart, for the crosshair price line/tag
  let dragState = null;
  let draftOrder = null;           // pending, unconfirmed order preview shown/draggable on the chart
                                    // { type, symbol, timeframe, entryPrice, sl, tp, volume, linked, rr }
  let draftLineZones = [];         // {y, type:'sl'|'tp'} drag hit-zones for the draft order lines, refreshed every draw()
  let pendingLineZones = [];       // {y, id} drag hit-zones for placed pending-order price lines
  let lastDrawMeta = null;         // for pixel<->price conversion outside draw()
  let tradeLineHitboxes = [];      // clickable close/cancel buttons drawn on the chart
  let chartType = "candle";        // "candle" | "line"
  let drawTool = "cursor";         // "cursor" | "trend" | "hline" | "rect"
  const drawings = {};             // drawings[screenId] = [{id,type,p1:{idx,price},p2:{idx,price}}]
  let activeDrawingDraft = null;   // in-progress drawing while placing points
  let selectedDrawingId = null;
  let drawingDragState = null;     // {id, handle:'p1'|'p2'|'body', startPx, startPy, origP1, origP2}
  let drawingHitboxes = [];        // refreshed every draw(), for hit-testing in mouse handlers
  let nextDrawingId = 1;
  let chartSettings = {            // right-click context menu settings
    showGrid: true,
    gridDensity: 6,
    showCrosshair: true,
    upColor: "#17c964",
    downColor: "#f5455c"
  };
  let candleColorsCustomized = false; // true once user manually picks a candle color; stops theme switches from overriding it
  let ctxMenuTarget = null;        // {drawingId} if the context menu was opened on top of a drawing
  let drawingsHidden = false;      // toolbar "mata" toggle — sembunyikan semua gambar tanpa menghapusnya
  let indicatorSettings = {        // indikator chart — nonaktif sampai user aktifkan dari menu Indikator
    ema20: false, ema50: false, sma50: false, rsi14: false
  };

  const el = (id) => document.getElementById(id);
  const chartCanvas = el("chart");
  const ctx = chartCanvas.getContext("2d");
  const themeVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ============================================================
     MODERN ICON SET — replaces emoji glyphs with clean inline SVG
     (stroke-based, currentColor, lucide-style). Only the icons
     change here; labels/text/behavior stay exactly as before.
     ============================================================ */
  const ICONS = {
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
    source: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    pulse: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
    link: '<path d="M9 15 15 9"/><path d="M11 6l1-1a4 4 0 0 1 6 6l-1 1"/><path d="M13 18l-1 1a4 4 0 0 1-6-6l1-1"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>',
    candlestick: '<rect x="4" y="8" width="4" height="8" rx="1"/><path d="M6 4v4M6 16v4"/><rect x="14" y="4" width="4" height="10" rx="1"/><path d="M16 2v2M16 14v2"/>',
    linechart: '<path d="M3 17l5-5 4 4 8-9"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.1M6.5 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.2-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    cursor: '<path d="M4 3l7 17 2-7 7-2-16-8Z"/>',
    trendline: '<path d="M4 20 20 4"/>',
    hline: '<path d="M4 12h16"/>',
    rect: '<rect x="4" y="7" width="16" height="10" rx="1"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
    skipback: '<path d="M19 20 9 12l10-8v16Z"/><path d="M5 19V5"/>',
    play: '<path d="M7 5v14l12-7Z"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    skipforward: '<path d="M5 4l10 8-10 8V4Z"/><path d="M19 5v14"/>',
    rotateccw: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1Z"/>'
  };
  function iconSvg(name, size){
    size = size || 16;
    const p = ICONS[name];
    if (!p) return "";
    return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  }
  function mountIcons(){
    document.querySelectorAll("[data-icon]").forEach(node => {
      const name = node.getAttribute("data-icon");
      const size = node.getAttribute("data-icon-size") || 16;
      node.innerHTML = iconSvg(name, size);
    });
  }


  function fmtPrice(v, digits){
    if (v === undefined || v === null || isNaN(v)) return "-";
    if (digits === undefined) digits = 2;
    return v.toLocaleString("id-ID", {minimumFractionDigits:digits, maximumFractionDigits:digits});
  }
  function fmtMoney(v){
    if (v === undefined || v === null || isNaN(v)) return "$0.00";
    const sign = v < 0 ? "-" : "";
    return sign + "$" + Math.abs(v).toLocaleString("id-ID", {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  /* ============================================================
     DATE HELPERS (tampil dalam WIB = UTC+7, sesuai script python)
     ============================================================ */
  const BULAN_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  function wibParts(unixSeconds){
    const d = new Date((unixSeconds + 7*3600) * 1000); // shift to WIB, read as UTC fields
    return {
      day: d.getUTCDate(),
      month: d.getUTCMonth(),
      year: d.getUTCFullYear(),
      hh: String(d.getUTCHours()).padStart(2,"0"),
      mm: String(d.getUTCMinutes()).padStart(2,"0"),
    };
  }
  function fmtDateShort(unixSeconds){
    if (!unixSeconds) return "—";
    const p = wibParts(unixSeconds);
    return `${p.day} ${BULAN_ID[p.month]}, ${p.hh}:${p.mm}`;
  }
  function fmtDateFull(unixSeconds){
    const p = wibParts(unixSeconds);
    return `${p.day} ${BULAN_ID[p.month]} ${p.year}, ${p.hh}:${p.mm} WIB`;
  }

  /* ============================================================
     SYMBOL / CONTRACT SPECS (dipakai untuk hitung P/L & jumlah desimal)
     ============================================================ */
  function getSpec(symbol){
    const s = (symbol || "").toUpperCase();
    if (s.startsWith("XAU")) return { contractSize:100, digits:2, pip:0.1 };
    if (s.startsWith("XAG")) return { contractSize:5000, digits:3, pip:0.01 };
    if (s.startsWith("BTC")) return { contractSize:1, digits:2, pip:1 };
    if (s.startsWith("ETH")) return { contractSize:1, digits:2, pip:0.1 };
    if (s.startsWith("US30") || s.startsWith("NAS") || s.startsWith("SPX")) return { contractSize:1, digits:2, pip:1 };
    if (/JPY/.test(s)) return { contractSize:100000, digits:3, pip:0.01 };
    return { contractSize:100000, digits:5, pip:0.0001 }; // default forex
  }

  /* ============================================================
     TRADING ENGINE STATE
     ============================================================ */
  let account = { balance: 10000 };
  let positions = [];       // open positions
  let pendingOrders = [];   // pending limit/stop orders
  let history = [];         // closed positions
  let nextOrderId = 1;
  let currentTermTab = "positions";

  function calcPnL(pos, price){
    if (price === undefined || price === null || isNaN(price)) return 0;
    const spec = getSpec(pos.symbol);
    const diff = pos.type === "buy" ? (price - pos.openPrice) : (pos.openPrice - price);
    return diff * spec.contractSize * pos.volume;
  }

  function currentPriceOf(scr){
    if (!scr || !scr.symbol || !library[scr.symbol] || !library[scr.symbol][scr.timeframe]) return null;
    const d = library[scr.symbol][scr.timeframe];
    const idx = scr.replay.active ? scr.replay.index : d.n - 1;
    return d.close[idx];
  }

  // Live price for a position: prefer a screen currently tracking the same symbol+timeframe,
  // otherwise fall back to the newest known candle for that symbol+timeframe.
  function priceForPosition(p){
    const scr = screens.find(s => s.symbol === p.symbol && s.timeframe === p.timeframe);
    if (scr){
      const price = currentPriceOf(scr);
      if (price !== null) return price;
    }
    const d = library[p.symbol] && library[p.symbol][p.timeframe];
    if (d) return d.close[d.n - 1];
    return p.openPrice;
  }

  function closePosition(p, price, time){
    p.status = "closed";
    p.closePrice = price;
    p.closeTime = time;
    p.pnl = calcPnL(p, price);
    account.balance += p.pnl;
    history.push(p);
    positions = positions.filter(x => x !== p);
  }

  function manualClosePosition(id){
    const p = positions.find(x => x.id === id);
    if (!p) return;
    const price = priceForPosition(p);
    closePosition(p, price, p.__lastBarTime || (Date.now()/1000));
    refreshTradingUI();
  }

  function closeAllPositions(){
    if (positions.length === 0) return;
    [...positions].forEach(p => {
      const price = priceForPosition(p);
      closePosition(p, price, p.__lastBarTime || (Date.now()/1000));
    });
    refreshTradingUI();
  }

  function cancelPendingOrder(id){
    const o = pendingOrders.find(x => x.id === id);
    if (o) o.status = "cancelled";
    pendingOrders = pendingOrders.filter(x => x.status === "pending");
    refreshTradingUI();
  }

  // Steps through candles (fromIdx, toIdx] for a symbol+timeframe, triggering pending
  // orders and checking SL/TP on open positions bar-by-bar (so nothing gets skipped).
  function processBarsForward(symbol, timeframe, fromIdx, toIdx){
    const d = library[symbol] && library[symbol][timeframe];
    if (!d) return;
    const start = Math.max(0, fromIdx + 1);
    for (let i = start; i <= toIdx; i++){
      const bar = { h:d.high[i], l:d.low[i], t:d.time[i] };

      pendingOrders
        .filter(o => o.status === "pending" && o.symbol === symbol && o.timeframe === timeframe)
        .forEach(o => {
          let trigger = false, fillPrice = o.price;
          if (o.type === "buy_limit"  && bar.l <= o.price) trigger = true;
          if (o.type === "sell_limit" && bar.h >= o.price) trigger = true;
          if (o.type === "buy_stop"   && bar.h >= o.price) trigger = true;
          if (o.type === "sell_stop"  && bar.l <= o.price) trigger = true;
          if (trigger){
            o.status = "triggered";
            positions.push({
              id: nextOrderId++, symbol, timeframe,
              type: o.type.startsWith("buy") ? "buy" : "sell",
              volume: o.volume, openPrice: fillPrice, openTime: bar.t, openIndex: i,
              sl: o.sl, tp: o.tp, status: "open", __lastBarTime: bar.t, __openedAt: performance.now()
            });
          }
        });
      pendingOrders = pendingOrders.filter(o => o.status === "pending");

      positions
        .filter(p => p.status === "open" && p.symbol === symbol && p.timeframe === timeframe)
        .forEach(p => {
          p.__lastBarTime = bar.t;
          let hitPrice = null;
          if (p.type === "buy"){
            if (p.sl != null && bar.l <= p.sl) hitPrice = p.sl;
            else if (p.tp != null && bar.h >= p.tp) hitPrice = p.tp;
          } else {
            if (p.sl != null && bar.h >= p.sl) hitPrice = p.sl;
            else if (p.tp != null && bar.l <= p.tp) hitPrice = p.tp;
          }
          if (hitPrice != null) closePosition(p, hitPrice, bar.t);
        });
    }
  }

  // Briefly keeps re-drawing the chart so the "just opened" pulse animation on a fresh
  // position actually animates, instead of only showing a single static frame.
  function pulseAnimation(durationMs){
    const t0 = performance.now();
    function step(){
      requestDraw();
      if (performance.now() - t0 < durationMs) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ============================================================
     DRAFT ORDER: pressing BELI/JUAL no longer fires instantly — it opens
     a draggable preview (entry/SL/TP lines + on-chart ticket) that the
     user confirms with KIRIM or discards with ✕ / Esc.
     ============================================================ */
  function fmtPoin(v){
    if (v === undefined || v === null || isNaN(v)) return "-";
    return Math.abs(v).toLocaleString("id-ID", {minimumFractionDigits:0, maximumFractionDigits:2});
  }

  function startDraftOrder(type){
    const scr = getActiveScreen();
    if (!scr || !scr.symbol){ alert("Pilih pair terlebih dahulu di tab PAIRS."); return; }
    const d = library[scr.symbol][scr.timeframe];
    const idx = scr.replay.active ? scr.replay.index : d.n - 1;
    const price = d.close[idx];
    const spec = getSpec(scr.symbol);
    const spread = spec.pip * 2;
    const entry = type === "buy" ? price + spread/2 : price - spread/2;
    const vol = Math.max(0.01, parseFloat(el("volInput").value) || 0.01);

    const autoSL = el("autoSlChk").checked;
    let sl = null, tp = null, linked = false;
    const rr = Math.max(0.01, parseFloat(el("rrInput").value) || 1);

    if (autoSL){
      const slPts = Math.max(0.00001, parseFloat(el("slPointsInput").value) || 0);
      sl = type === "buy" ? entry - slPts : entry + slPts;
      tp = type === "buy" ? entry + slPts*rr : entry - slPts*rr;
      linked = true;
    } else {
      sl = el("slInput").value ? parseFloat(el("slInput").value) : null;
      tp = el("tpInput").value ? parseFloat(el("tpInput").value) : null;
    }

    draftOrder = { kind:"market", type, symbol: scr.symbol, timeframe: scr.timeframe, entryPrice: entry, sl, tp, volume: vol, linked, rr };
    el("dtQty").value = vol.toFixed(2);
    updateDraftTicketLabel();
    requestDraw();
  }

  // Pending order: same draggable draft-preview flow as market orders, but the "entry"
  // line becomes the pending order's trigger price and is itself draggable.
  function startDraftPending(){
    const scr = getActiveScreen();
    if (!scr || !scr.symbol){ alert("Pilih pair terlebih dahulu di tab PAIRS."); return; }
    const d = library[scr.symbol][scr.timeframe];
    const idx = scr.replay.active ? scr.replay.index : d.n - 1;
    const curPrice = d.close[idx];
    const pendingType = el("pendingType").value; // buy_limit | sell_limit | buy_stop | sell_stop
    const type = pendingType.startsWith("buy") ? "buy" : "sell";
    const spec = getSpec(scr.symbol);
    let entry = parseFloat(el("pendingPrice").value);
    if (!entry || isNaN(entry)){
      const off = spec.pip * 50;
      entry = pendingType === "buy_limit" ? curPrice - off
            : pendingType === "sell_limit" ? curPrice + off
            : pendingType === "buy_stop" ? curPrice + off
            : curPrice - off;
    }
    const vol = Math.max(0.01, parseFloat(el("volInput").value) || 0.01);
    const autoSL = el("autoSlChk").checked;
    let sl = null, tp = null, linked = false;
    const rr = Math.max(0.01, parseFloat(el("rrInput").value) || 1);
    if (autoSL){
      const slPts = Math.max(0.00001, parseFloat(el("slPointsInput").value) || 0);
      sl = type === "buy" ? entry - slPts : entry + slPts;
      tp = type === "buy" ? entry + slPts*rr : entry - slPts*rr;
      linked = true;
    } else {
      sl = el("slInput").value ? parseFloat(el("slInput").value) : null;
      tp = el("tpInput").value ? parseFloat(el("tpInput").value) : null;
    }
    draftOrder = { kind:"pending", pendingType, type, symbol: scr.symbol, timeframe: scr.timeframe,
      entryPrice: entry, sl, tp, volume: vol, linked, rr };
    el("dtQty").value = vol.toFixed(2);
    updateDraftTicketLabel();
    requestDraw();
  }

  function updateTpReadout(){
    const slPts = Math.max(0, parseFloat(el("slPointsInput").value) || 0);
    const rr = Math.max(0, parseFloat(el("rrInput").value) || 0);
    el("tpPointsReadout").textContent = fmtPoin(slPts * rr);
  }

  function updateDraftEntry(newPrice){
    if (!draftOrder || draftOrder.kind !== "pending") return;
    const spec = getSpec(draftOrder.symbol);
    const oldEntry = draftOrder.entryPrice;
    const delta = newPrice - oldEntry;
    draftOrder.entryPrice = newPrice;
    if (draftOrder.linked){
      const slPts = Math.max(0.00001, parseFloat(el("slPointsInput").value) || 0);
      const rr = draftOrder.rr || Math.max(0.01, parseFloat(el("rrInput").value) || 1);
      draftOrder.sl = draftOrder.type === "buy" ? newPrice - slPts : newPrice + slPts;
      draftOrder.tp = draftOrder.type === "buy" ? newPrice + slPts*rr : newPrice - slPts*rr;
    } else {
      if (draftOrder.sl != null) draftOrder.sl += delta;
      if (draftOrder.tp != null) draftOrder.tp += delta;
      if (draftOrder.sl != null) el("slInput").value = draftOrder.sl.toFixed(spec.digits);
      if (draftOrder.tp != null) el("tpInput").value = draftOrder.tp.toFixed(spec.digits);
    }
    el("pendingPrice").value = newPrice.toFixed(spec.digits);
    updateDraftTicketLabel();
  }

  function updateDraftSL(newPrice){
    if (!draftOrder) return;
    const entry = draftOrder.entryPrice;
    if (draftOrder.type === "buy" && newPrice >= entry) newPrice = entry - 0.00001;
    if (draftOrder.type === "sell" && newPrice <= entry) newPrice = entry + 0.00001;
    draftOrder.sl = newPrice;
    const slPts = Math.abs(entry - newPrice);
    if (draftOrder.linked){
      const rr = draftOrder.rr || 2;
      draftOrder.tp = draftOrder.type === "buy" ? entry + slPts*rr : entry - slPts*rr;
      el("slPointsInput").value = slPts.toFixed(2);
      updateTpReadout();
    } else {
      el("slInput").value = newPrice.toFixed(getSpec(draftOrder.symbol).digits);
    }
    updateDraftTicketLabel();
  }

  function updateDraftTP(newPrice){
    if (!draftOrder) return;
    const entry = draftOrder.entryPrice;
    if (draftOrder.type === "buy" && newPrice <= entry) newPrice = entry + 0.00001;
    if (draftOrder.type === "sell" && newPrice >= entry) newPrice = entry - 0.00001;
    draftOrder.tp = newPrice;
    const tpPts = Math.abs(entry - newPrice);
    if (draftOrder.linked){
      const rr = draftOrder.rr || 2;
      const slPts = tpPts / rr;
      draftOrder.sl = draftOrder.type === "buy" ? entry - slPts : entry + slPts;
      el("slPointsInput").value = slPts.toFixed(2);
      updateTpReadout();
    } else {
      el("tpInput").value = newPrice.toFixed(getSpec(draftOrder.symbol).digits);
    }
    updateDraftTicketLabel();
  }

  function updateDraftTicketLabel(){
    const bar = el("draftTicketBar");
    if (!draftOrder){ bar.classList.add("hidden"); return; }
    bar.classList.remove("hidden");
    bar.classList.toggle("dt-buy", draftOrder.type === "buy");
    bar.classList.toggle("dt-sell", draftOrder.type === "sell");
    const spec = getSpec(draftOrder.symbol);
    const entry = draftOrder.entryPrice;
    const slPts = draftOrder.sl != null ? Math.abs(entry - draftOrder.sl) : null;
    const tpPts = draftOrder.tp != null ? Math.abs(entry - draftOrder.tp) : null;
    const rrTxt = (slPts != null && tpPts != null && slPts > 0) ? (tpPts/slPts).toFixed(1) : "-";
    const kindTxt = draftOrder.kind === "pending" ? draftOrder.pendingType.toUpperCase().replace("_"," ") : (draftOrder.type === "buy" ? "BUY" : "SELL");
    const parts = [kindTxt + " " + fmtPrice(entry, spec.digits)];
    if (slPts != null) parts.push("SL " + fmtPoin(slPts) + " poin");
    if (tpPts != null) parts.push("TP " + fmtPoin(tpPts) + " poin");
    parts.push("R/R 1:" + rrTxt);
    el("dtLabel").textContent = parts.join(" · ");
    el("dtSend").textContent = draftOrder.kind === "pending" ? "PASANG" : "KIRIM";
  }

  function sendDraftOrder(){
    if (!draftOrder) return;
    const scr = getActiveScreen();
    if (!scr || scr.symbol !== draftOrder.symbol || scr.timeframe !== draftOrder.timeframe){
      alert("Pindah dulu ke chart pair yang sama dengan draft order ini."); return;
    }
    const d = library[draftOrder.symbol][draftOrder.timeframe];
    const idx = scr.replay.active ? scr.replay.index : d.n - 1;
    const entry = draftOrder.entryPrice;

    if (draftOrder.sl != null){
      if (draftOrder.type === "buy" && draftOrder.sl >= entry){ alert("SL untuk BUY harus di bawah harga entry."); return; }
      if (draftOrder.type === "sell" && draftOrder.sl <= entry){ alert("SL untuk SELL harus di atas harga entry."); return; }
    }
    if (draftOrder.tp != null){
      if (draftOrder.type === "buy" && draftOrder.tp <= entry){ alert("TP untuk BUY harus di atas harga entry."); return; }
      if (draftOrder.type === "sell" && draftOrder.tp >= entry){ alert("TP untuk SELL harus di bawah harga entry."); return; }
    }

    const vol = Math.max(0.01, parseFloat(el("dtQty").value) || draftOrder.volume);

    if (draftOrder.kind === "pending"){
      pendingOrders.push({
        id: nextOrderId++, symbol: draftOrder.symbol, timeframe: draftOrder.timeframe,
        type: draftOrder.pendingType, volume: vol, price: entry, sl: draftOrder.sl, tp: draftOrder.tp,
        status: "pending", createdTime: d.time[idx]
      });
    } else {
      positions.push({
        id: nextOrderId++, symbol: draftOrder.symbol, timeframe: draftOrder.timeframe, type: draftOrder.type,
        volume: vol, openPrice: entry, openTime: d.time[idx], openIndex: idx,
        sl: draftOrder.sl, tp: draftOrder.tp, status: "open", __lastBarTime: d.time[idx], __openedAt: performance.now()
      });
      pulseAnimation(850);
    }
    draftOrder = null;
    el("slInput").value = ""; el("tpInput").value = ""; el("pendingPrice").value = "";
    updateDraftTicketLabel();
    refreshTradingUI();
  }

  function cancelDraftOrder(){
    draftOrder = null;
    updateDraftTicketLabel();
    requestDraw();
  }

  el("buyBtn").addEventListener("click", () => startDraftOrder("buy"));
  el("sellBtn").addEventListener("click", () => startDraftOrder("sell"));
  el("dtSend").addEventListener("click", sendDraftOrder);
  el("dtCancel").addEventListener("click", cancelDraftOrder);
  el("dtQty").addEventListener("change", () => {
    const v = Math.max(0.01, parseFloat(el("dtQty").value) || 0.01);
    el("dtQty").value = v.toFixed(2);
    el("volInput").value = v.toFixed(2);
    if (draftOrder) draftOrder.volume = v;
  });

  /* ---------- Atur SL/TP settings (points + R/R lock) ---------- */
  el("autoSlChk").addEventListener("change", () => {
    if (draftOrder) draftOrder.linked = el("autoSlChk").checked;
    updateDraftTicketLabel();
  });
  el("slPointsInput").addEventListener("input", () => {
    updateTpReadout();
    if (draftOrder && draftOrder.linked){
      const slPts = Math.max(0.00001, parseFloat(el("slPointsInput").value) || 0);
      const rr = Math.max(0.01, parseFloat(el("rrInput").value) || 1);
      const entry = draftOrder.entryPrice;
      draftOrder.rr = rr;
      draftOrder.sl = draftOrder.type === "buy" ? entry - slPts : entry + slPts;
      draftOrder.tp = draftOrder.type === "buy" ? entry + slPts*rr : entry - slPts*rr;
      updateDraftTicketLabel();
      requestDraw();
    }
  });
  el("rrInput").addEventListener("input", () => {
    updateTpReadout();
    if (draftOrder && draftOrder.linked && draftOrder.sl != null){
      const rr = Math.max(0.01, parseFloat(el("rrInput").value) || 1);
      const entry = draftOrder.entryPrice;
      const slPts = Math.abs(entry - draftOrder.sl);
      draftOrder.rr = rr;
      draftOrder.tp = draftOrder.type === "buy" ? entry + slPts*rr : entry - slPts*rr;
      updateDraftTicketLabel();
      requestDraw();
    }
  });
  updateTpReadout();

  el("placePendingBtn").addEventListener("click", startDraftPending);

  el("editBalanceBtn").addEventListener("click", () => {
    const val = prompt("Masukkan saldo awal baru (USD):", account.balance.toFixed(2));
    if (val !== null && !isNaN(parseFloat(val))){
      account.balance = parseFloat(val);
      refreshTradingUI();
    }
  });

  el("pickPriceBtn").addEventListener("click", () => {
    pendingPickMode = !pendingPickMode;
    el("pickPriceBtn").classList.toggle("active", pendingPickMode);
    chartCanvas.classList.toggle("picking", pendingPickMode);
  });

  /* ---------- pending popover (top bar) ---------- */
  el("pendingToggleBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const pop = el("pendingPopover");
    pop.classList.toggle("hidden");
    el("pendingToggleBtn").classList.toggle("active", !pop.classList.contains("hidden"));
  });
  document.addEventListener("click", (e) => {
    const pop = el("pendingPopover");
    if (pop.classList.contains("hidden")) return;
    if (e.target.closest("#pendingPopover") || e.target.closest("#pendingToggleBtn")) return;
    pop.classList.add("hidden");
    el("pendingToggleBtn").classList.remove("active");
  });

  /* ---------- settings popover (Muat Folder Data / Sumber GitHub, tucked out of the way) ---------- */
  el("settingsToggleBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const pop = el("settingsPopover");
    pop.classList.toggle("hidden");
    el("settingsToggleBtn").classList.toggle("active", !pop.classList.contains("hidden"));
  });
  document.addEventListener("click", (e) => {
    const pop = el("settingsPopover");
    if (pop.classList.contains("hidden")) return;
    if (e.target.closest("#settingsPopover") || e.target.closest("#settingsToggleBtn")) return;
    pop.classList.add("hidden");
    el("settingsToggleBtn").classList.remove("active");
  });
  // Muat Folder Data / Sumber GitHub both close the settings popover once clicked, since
  // they either open the OS file picker or the GitHub modal right after.
  el("loadBtn").addEventListener("click", () => {
    el("settingsPopover").classList.add("hidden");
    el("settingsToggleBtn").classList.remove("active");
  });
  el("githubBtn").addEventListener("click", () => {
    el("settingsPopover").classList.add("hidden");
    el("settingsToggleBtn").classList.remove("active");
  });

  /* ---------- trade ticket / account UI ---------- */
  function updateAccountUI(){
    let floating = 0;
    positions.forEach(p => { floating += calcPnL(p, priceForPosition(p)); });
    const equity = account.balance + floating;
    el("acctBalance").textContent = fmtMoney(account.balance);
    el("acctEquity").textContent = fmtMoney(equity);
    el("acctFloating").textContent = fmtMoney(floating);
    el("acctFloating").className = floating >= 0 ? "pos" : "neg";

    el("ticketBalance").textContent = fmtMoney(account.balance);
    el("ticketEquity").textContent = fmtMoney(equity);
    const tf = el("ticketFloating");
    tf.textContent = fmtMoney(floating);
    tf.className = floating >= 0 ? "pos" : "neg";

    const openCount = positions.length + pendingOrders.filter(o=>o.status==="pending").length;
    const badge = el("backtestBadge");
    if (openCount > 0){ badge.textContent = openCount; badge.classList.remove("hidden"); }
    else { badge.classList.add("hidden"); }
  }

  function updateTicketUI(){
    const scr = getActiveScreen();
    if (!scr || !scr.symbol){
      el("ticketSymbol").textContent = "— pilih pair —";
      el("ticketBid").textContent = "-"; el("ticketAsk").textContent = "-";
      el("buyPrice").textContent = "-"; el("sellPrice").textContent = "-";
      return;
    }
    el("ticketSymbol").textContent = `${scr.symbol} · ${scr.timeframe}`;
    const price = currentPriceOf(scr);
    const spec = getSpec(scr.symbol);
    const spread = spec.pip * 2;
    const bid = price - spread/2, ask = price + spread/2;
    el("ticketBid").textContent = fmtPrice(bid, spec.digits);
    el("ticketAsk").textContent = fmtPrice(ask, spec.digits);
    el("buyPrice").textContent = fmtPrice(ask, spec.digits);
    el("sellPrice").textContent = fmtPrice(bid, spec.digits);
  }

  /* ============================================================
     BACKTEST PANEL: Posisi / Riwayat / Atur
     ============================================================ */
  let currentBtTab = "posisi";
  let showTrails = false;
  el("showTrailsChk").addEventListener("change", () => { showTrails = el("showTrailsChk").checked; requestDraw(); });

  document.querySelectorAll(".bt-subtab[data-bt]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".bt-subtab[data-bt]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentBtTab = btn.dataset.bt;
      ["posisi","riwayat","atur"].forEach(t => el("btPanel" + t[0].toUpperCase()+t.slice(1)).classList.toggle("hidden", t !== currentBtTab));
      renderBacktestBody();
    });
  });

  function renderPosisiPanel(){
    const wrap = el("btPanelPosisi");
    let html = "";
    if (positions.length === 0){
      html += '<div class="term-empty">Belum ada posisi terbuka. Buka lewat BUY/SELL di topbar.</div>';
    } else {
      const rows = positions.map(p => {
        const price = priceForPosition(p);
        const pnl = calcPnL(p, price);
        const spec = getSpec(p.symbol);
        return `<tr>
          <td>${p.symbol} <span style="color:var(--muted)">${p.timeframe}</span></td>
          <td class="${p.type==='buy'?'tag-buy':'tag-sell'}">${p.type==='buy'?'BUY':'SELL'}</td>
          <td>${p.volume.toFixed(2)}</td>
          <td>${fmtPrice(p.openPrice, spec.digits)}</td>
          <td>${p.sl!=null?fmtPrice(p.sl, spec.digits):'-'}</td>
          <td>${p.tp!=null?fmtPrice(p.tp, spec.digits):'-'}</td>
          <td>${fmtPrice(price, spec.digits)}</td>
          <td class="${pnl>=0?'pnl-pos':'pnl-neg'}">${pnl>=0?'+':''}${pnl.toFixed(2)}</td>
          <td><button class="term-close-btn" data-close="${p.id}">Tutup</button></td>
        </tr>`;
      }).join("");
      html += `<table class="term-table"><thead><tr>
        <th>Symbol</th><th>Tipe</th><th>Lot</th><th>Entry</th><th>SL</th><th>TP</th><th>Skrg</th><th>P/L</th><th></th>
      </tr></thead><tbody>${rows}</tbody></table>`;
      html += `<button id="closeAllBtn" class="mini-btn danger">Tutup Semua Posisi (${positions.length})</button>`;
    }

    const pend = pendingOrders.filter(o => o.status === "pending");
    html += '<div class="term-subhead">Pending Order</div>';
    if (pend.length === 0){
      html += '<div class="term-empty">Tidak ada pending order.</div>';
    } else {
      const rows2 = pend.map(o => {
        const spec = getSpec(o.symbol);
        return `<tr>
          <td>${o.symbol} <span style="color:var(--muted)">${o.timeframe}</span></td>
          <td>${o.type.toUpperCase().replace("_"," ")}</td>
          <td>${o.volume.toFixed(2)}</td>
          <td>${fmtPrice(o.price, spec.digits)}</td>
          <td><button class="term-close-btn" data-cancel="${o.id}">Batalkan</button></td>
        </tr>`;
      }).join("");
      html += `<table class="term-table"><thead><tr>
        <th>Symbol</th><th>Tipe</th><th>Lot</th><th>Harga</th><th></th>
      </tr></thead><tbody>${rows2}</tbody></table>`;
    }

    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => manualClosePosition(parseInt(b.dataset.close,10))));
    wrap.querySelectorAll("[data-cancel]").forEach(b => b.addEventListener("click", () => cancelPendingOrder(parseInt(b.dataset.cancel,10))));
    const closeAll = el("closeAllBtn");
    if (closeAll) closeAll.addEventListener("click", () => {
      if (positions.length === 0) return;
      if (!confirm(`Tutup semua ${positions.length} posisi terbuka?`)) return;
      closeAllPositions();
    });
  }

  function renderRiwayatPanel(){
    const wrap = el("btPanelRiwayat");
    if (history.length === 0){
      wrap.innerHTML = '<div class="term-empty">Belum ada trade selesai. Riwayat muncul setelah posisi ditutup (TP/SL/manual).</div>';
      return;
    }
    const ordered = [...history].reverse();
    let html = `<div class="rw-head"><span>${history.length} trade selesai</span><button id="rwClearAll">Hapus semua</button></div>`;
    html += ordered.map(p => {
      const spec = getSpec(p.symbol);
      const rTxt = p.rMultiple != null ? (p.rMultiple>=0?"+":"") + p.rMultiple.toFixed(2) + "R" : (p.pnl>=0?"+":"") + "$"+Math.abs(p.pnl).toFixed(2);
      const rCls = (p.rMultiple != null ? p.rMultiple : p.pnl) >= 0 ? "pos" : "neg";
      const pip = p.pointsMoved != null ? p.pointsMoved.toFixed(1) : "-";
      const dateTxt = fmtDateShort(p.openTime).split(",")[0];
      return `<div class="rw-card">
        <span class="rw-badge ${p.type==='buy'?'buy':'sell'}">${p.type==='buy'?'BUY':'SELL'}</span>
        <div class="rw-mid">
          <div class="rw-sym">${p.symbol}<span class="rw-tf">${p.timeframe} · ${p.slAtOpen!=null && p.tpAtOpen!=null ? (p.slAtOpen!=null&&p.pnl<=0?'SL':(p.tpAtOpen!=null&&p.pnl>0?'TP':'MANUAL')) : 'MANUAL'}</span></div>
          <div class="rw-range">${dateTxt} · ${fmtPrice(p.openPrice,spec.digits)} → ${fmtPrice(p.closePrice,spec.digits)}</div>
        </div>
        <div class="rw-right">
          <div class="rw-r ${rCls}">${rTxt}</div>
          <div class="rw-pip">${p.pnl>=0?'+':''}${pip} poin</div>
        </div>
        <button class="rw-del" data-del="${p.id}" title="Hapus dari riwayat">${iconSvg("close",12)}</button>
      </div>`;
    }).join("");
    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => {
      const id = parseInt(b.dataset.del,10);
      const i = history.findIndex(x => x.id === id);
      if (i !== -1) history.splice(i,1);
      renderBacktestBody(); updateSummaryUI();
    }));
    const clearBtn = el("rwClearAll");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      if (!confirm("Hapus semua riwayat trade?")) return;
      history.length = 0;
      renderBacktestBody(); updateSummaryUI();
    });
  }

  function renderBacktestBody(){
    if (currentBtTab === "posisi") renderPosisiPanel();
    else if (currentBtTab === "riwayat") renderRiwayatPanel();
    el("btPosCount").textContent = positions.length;
    el("btHistCount").textContent = history.length;
  }

  /* ============================================================
     STATISTIK: hitung metrik performa (R-multiple based) dari riwayat trade
     ============================================================ */
  function computeStats(){
    const n = history.length;
    const withR = history.filter(p => p.rMultiple != null);
    const wins = history.filter(p => p.pnl > 0);
    const losses = history.filter(p => p.pnl < 0);
    const breakeven = n - wins.length - losses.length;
    const grossProfit = wins.reduce((s,p) => s + p.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s,p) => s + p.pnl, 0));
    const winRate = n ? (wins.length / n * 100) : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
    const totalPnl = history.reduce((s,p) => s + p.pnl, 0);

    const totalR = withR.reduce((s,p) => s + p.rMultiple, 0);
    const winsR = withR.filter(p => p.rMultiple > 0);
    const lossesR = withR.filter(p => p.rMultiple < 0);
    const avgWinR = winsR.length ? winsR.reduce((s,p)=>s+p.rMultiple,0)/winsR.length : 0;
    const avgLossR = lossesR.length ? lossesR.reduce((s,p)=>s+p.rMultiple,0)/lossesR.length : 0;
    const expectancyR = withR.length ? totalR / withR.length : 0;

    const totalPoints = history.reduce((s,p) => s + (p.pointsMoved||0), 0);
    const avgPoints = n ? totalPoints / n : 0;

    // R equity curve & max drawdown (in R), walked in close order
    const ordered = [...history].sort((a,b) => (a.closeTime||0) - (b.closeTime||0));
    let running = 0, peak = 0, maxDD = 0;
    const curveR = [0];
    ordered.forEach(p => {
      if (p.rMultiple == null) return;
      running += p.rMultiple;
      curveR.push(running);
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > maxDD) maxDD = dd;
    });

    // win/loss streaks
    let curStreak = 0, curSign = 0, bestWinStreak = 0, worstLossStreak = 0;
    ordered.forEach(p => {
      const sign = p.pnl > 0 ? 1 : (p.pnl < 0 ? -1 : 0);
      if (sign === curSign) curStreak++;
      else { curStreak = 1; curSign = sign; }
      if (sign > 0) bestWinStreak = Math.max(bestWinStreak, curStreak);
      else if (sign < 0) worstLossStreak = Math.max(worstLossStreak, curStreak);
    });

    // biggest single-trade share of total profit (for the insight sentence)
    let dominantShare = 0;
    if (totalR > 0 && withR.length){
      const maxSingle = Math.max(...withR.map(p => p.rMultiple));
      dominantShare = maxSingle / totalR;
    }

    return { n, wins: wins.length, losses: losses.length, breakeven, winRate, profitFactor, totalPnl,
      totalR, avgWinR, avgLossR, expectancyR, totalPoints, avgPoints, maxDD, bestWinStreak, worstLossStreak,
      curveR, withRCount: withR.length, dominantShare };
  }

  function fmtSigned(v, dec){
    dec = dec===undefined?2:dec;
    return (v>=0?"+":"") + v.toFixed(dec).replace(".", ",");
  }

  function drawSparkline(curveR){
    const canvas = el("btSpark");
    const c = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    c.clearRect(0,0,w,h);
    if (!curveR || curveR.length < 2) return;
    const lo = Math.min(...curveR), hi = Math.max(...curveR);
    const range = (hi - lo) || 1;
    const stepX = w / (curveR.length - 1);
    const up = curveR[curveR.length-1] >= curveR[0];
    c.strokeStyle = up ? chartSettings.upColor : chartSettings.downColor;
    c.lineWidth = 1.6;
    c.beginPath();
    curveR.forEach((v,i) => {
      const x = i*stepX;
      const y = h - ((v - lo) / range) * (h-4) - 2;
      if (i===0) c.moveTo(x,y); else c.lineTo(x,y);
    });
    c.stroke();
    c.lineTo(w, h); c.lineTo(0, h); c.closePath();
    c.fillStyle = up ? (chartSettings.upColor + "1f") : (chartSettings.downColor + "1f");
    c.fill();
  }

  function updateSummaryUI(){
    const s = computeStats();
    const totalREl = el("btTotalR");
    totalREl.textContent = fmtSigned(s.totalR) ;
    totalREl.classList.toggle("neg", s.totalR < 0);
    el("btTotalRSub").textContent = `${s.n} trade ber-SL`.replace(s.n, s.withRCount) ;
    el("btTotalRSub").textContent = `${s.withRCount} trade ber-SL`;
    el("btProgressFill").style.width = Math.max(0, Math.min(100, s.winRate)) + "%";
    el("btWinRate").textContent = s.n ? s.winRate.toFixed(0) + "%" : "0%";
    el("btExpect").textContent = fmtSigned(s.expectancyR);
    el("btPF").textContent = isFinite(s.profitFactor) ? s.profitFactor.toFixed(2).replace(".",",") : "∞";
    el("btDD").textContent = "-" + s.maxDD.toFixed(2).replace(".",",");
    el("btWLB").textContent = `${s.wins}/${s.breakeven}/${s.losses}`;
    el("btAvgWin").textContent = fmtSigned(s.avgWinR);
    el("btAvgLoss").textContent = fmtSigned(s.avgLossR);
    el("btLossStreak").textContent = s.worstLossStreak;
    el("btTotalPip").textContent = fmtSigned(s.totalPoints, 1);
    el("btAvgPip").textContent = fmtSigned(s.avgPoints, 1);
    const scr = getActiveScreen();
    el("btPipNote").textContent = `poin ${scr && scr.symbol ? scr.symbol : ""} · dari ${s.n} trade`;

    const insightEl = el("btInsight");
    if (s.n >= 3 && s.dominantShare > 0.5){
      insightEl.textContent = "Lebih dari separuh hasil datang dari satu trade.";
      insightEl.classList.remove("hidden");
    } else if (s.n >= 5 && s.winRate < 40 && s.profitFactor >= 1.2){
      insightEl.textContent = "Win rate di bawah 40%, tapi tetap profitable — kemenangan kamu jauh lebih besar dari kekalahan.";
      insightEl.classList.remove("hidden");
    } else {
      insightEl.classList.add("hidden");
    }

    drawSparkline(s.curveR);
  }

  el("btDownloadBtn").addEventListener("click", downloadRecapCard);

  function downloadRecapCard(){
    const s = computeStats();
    const cw = 640, ch = 420;
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const c = canvas.getContext("2d");
    c.fillStyle = "#10141c"; c.fillRect(0,0,cw,ch);
    c.strokeStyle = "#1f2530"; c.lineWidth = 2; c.strokeRect(1,1,cw-2,ch-2);
    c.fillStyle = "#7b8496"; c.font = "700 12px sans-serif"; c.fillText("UJI MAJU · REPLAY", 28, 36);
    c.fillStyle = s.totalR>=0 ? "#17c964" : "#f5455c";
    c.font = "800 46px ui-monospace, monospace";
    c.fillText(fmtSigned(s.totalR), 28, 96);
    c.fillStyle = "#7b8496"; c.font = "12px sans-serif";
    c.fillText(`${s.withRCount} trade ber-SL · ${s.n} total trade`, 28, 118);

    const stats = [
      ["WIN RATE", s.winRate.toFixed(0)+"%"], ["EKSPEKTANSI", fmtSigned(s.expectancyR)],
      ["PROFIT FACTOR", isFinite(s.profitFactor)?s.profitFactor.toFixed(2):"∞"], ["PENURUNAN", "-"+s.maxDD.toFixed(2)],
      ["M/IMPAS/K", `${s.wins}/${s.breakeven}/${s.losses}`], ["RATA MENANG", fmtSigned(s.avgWinR)],
      ["RATA KALAH", fmtSigned(s.avgLossR)], ["RUNTUN KALAH", String(s.worstLossStreak)]
    ];
    const colW = (cw-56)/4;
    stats.forEach((st,i) => {
      const col = i % 4, row = Math.floor(i/4);
      const x = 28 + col*colW, y = 160 + row*70;
      c.fillStyle = "#7b8496"; c.font = "700 10px sans-serif"; c.fillText(st[0], x, y);
      c.fillStyle = "#e6e9ef"; c.font = "700 18px ui-monospace, monospace"; c.fillText(st[1], x, y+24);
    });

    c.fillStyle = "#7b8496"; c.font = "700 10px sans-serif";
    c.fillText(`TOTAL POIN ${fmtSigned(s.totalPoints,1)}   ·   RATA POIN ${fmtSigned(s.avgPoints,1)}`, 28, 330);

    c.fillStyle = "#4d5566"; c.font = "11px sans-serif";
    c.fillText("PNG berwatermark al-haza.id · " + new Date().toLocaleDateString("id-ID"), 28, ch-20);
    c.font = "700 12px sans-serif"; c.fillStyle = "#4f8cff"; c.textAlign = "right";
    c.fillText("AL-HAZA", cw-28, ch-20);
    c.textAlign = "left";

    const a = document.createElement("a");
    a.download = "kartu-rekap-backtest.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  function refreshTradingUI(){
    updateAccountUI();
    updateTicketUI();
    renderBacktestBody();
    updateSummaryUI();
    draw();
  }

  /* ---------- right rail: Watchlist / Backtest side panels ---------- */
  function openSidePanel(id){
    ["wlPanelPairs","wlPanelBacktest"].forEach(p => el(p).classList.toggle("hidden", p !== id));
    el("railWatchlistBtn").classList.toggle("active", id === "wlPanelPairs");
    el("railBacktestBtn").classList.toggle("active", id === "wlPanelBacktest");
    if (id === "wlPanelBacktest"){ updateTicketUI(); renderBacktestBody(); updateSummaryUI(); }
    requestAnimationFrame(resizeCanvas);
  }
  function closeSidePanels(){
    el("wlPanelPairs").classList.add("hidden");
    el("wlPanelBacktest").classList.add("hidden");
    el("railWatchlistBtn").classList.remove("active");
    el("railBacktestBtn").classList.remove("active");
    requestAnimationFrame(resizeCanvas);
  }
  el("railWatchlistBtn").addEventListener("click", () => {
    el("wlPanelPairs").classList.contains("hidden") ? openSidePanel("wlPanelPairs") : closeSidePanels();
  });
  el("railBacktestBtn").addEventListener("click", () => {
    el("wlPanelBacktest").classList.contains("hidden") ? openSidePanel("wlPanelBacktest") : closeSidePanels();
  });
  el("closeWlBtn").addEventListener("click", closeSidePanels);
  el("closeBtBtn").addEventListener("click", closeSidePanels);

  /* ============================================================
     AUTO-LOAD (langsung baca folder sejajar dengan index.html
     lewat fetch(), tanpa perlu klik apa-apa)
     ============================================================ */
  const AUTO_SYMBOLS = ["XAUUSDc", "BTCUSDc"];
  const AUTO_TIMEFRAMES = TF_ORDER;
  const AUTO_START = { year: 2025, month: 1 }; // sesuaikan dgn TANGGAL_MULAI di script python

  const BULAN_FULL_UPPER = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI","JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"];

  /* ---------- GitHub raw-content fallback (dipakai kalau fetch relatif "./" gagal,
     misal file dibuka langsung dari komputer atau di-host di luar GitHub Pages) ---------- */
  const GITHUB_KEY = "replayBacktestGithubSource";
  function loadGithubSource(){
    try{ return JSON.parse(localStorage.getItem(GITHUB_KEY) || "null"); }catch(err){ return null; }
  }
  function saveGithubSource(src){
    try{ localStorage.setItem(GITHUB_KEY, JSON.stringify(src)); }catch(err){ /* ignore */ }
  }
  let githubSource = loadGithubSource();
  function githubRawBase(src){
    src = src || githubSource;
    if (!src || !src.user || !src.repo) return null;
    const branch = src.branch || "main";
    return `https://raw.githubusercontent.com/${encodeURIComponent(src.user)}/${encodeURIComponent(src.repo)}/${encodeURIComponent(branch)}/`;
  }
  function updateGithubBtnState(){
    el("githubBtn").classList.toggle("active", !!githubSource);
    el("githubBtn").innerHTML = iconSvg("source") + " " + (githubSource ? githubSource.repo : "Sumber GitHub");
  }

  // Candidate base URLs to try, in priority order: same-origin first (works when this
  // index.html is served via GitHub Pages or a local server from the same folder as the
  // data), then the configured GitHub raw-content repo as a fallback.
  function candidateBases(){
    const bases = [];
    if (location.protocol !== "file:") bases.push("./");
    const ghBase = githubRawBase();
    if (ghBase) bases.push(ghBase);
    if (bases.length === 0) bases.push("./");
    return bases;
  }

  // Figures out ONCE which base actually has data (instead of trying every base for every
  // one of the ~300 file combinations, which would double every request).
  async function resolveDataBase(){
    const bases = candidateBases();
    for (const base of bases){
      const idx = await tryFetchJson(base + "_index.json");
      if (Array.isArray(idx) && idx.length > 0) return { base, index: idx };
    }
    const probeSym = AUTO_SYMBOLS[0], probeTf = AUTO_TIMEFRAMES[0];
    const probeFolder = `${probeSym}-${probeTf}`.toLowerCase();
    const probeFile = `${probeSym}_${probeTf}_${BULAN_FULL_UPPER[AUTO_START.month-1]}_${AUTO_START.year}.json`;
    for (const base of bases){
      const probe = await tryFetchJson(`${base}${probeFolder}/${probeFile}`);
      if (probe) return { base, index: null };
    }
    return { base: bases[0], index: null };
  }

  el("githubBtn").addEventListener("click", () => {
    el("ghUser").value = githubSource ? githubSource.user : "";
    el("ghRepo").value = githubSource ? githubSource.repo : "";
    el("ghBranch").value = githubSource ? (githubSource.branch || "main") : "main";
    el("ghStatus").className = "modal-status";
    el("githubModal").classList.remove("hidden");
  });
  el("ghCancel").addEventListener("click", () => el("githubModal").classList.add("hidden"));
  el("ghClear").addEventListener("click", () => {
    githubSource = null;
    saveGithubSource(null);
    updateGithubBtnState();
    el("githubModal").classList.add("hidden");
    autoLoad();
  });
  el("ghSave").addEventListener("click", async () => {
    const user = el("ghUser").value.trim();
    const repo = el("ghRepo").value.trim();
    const branch = el("ghBranch").value.trim() || "main";
    if (!user || !repo){ alert("Isi username dan nama repo GitHub dulu."); return; }
    const status = el("ghStatus");
    status.className = "modal-status show loading";
    status.textContent = "Mengecek repo…";
    const testSrc = { user, repo, branch };
    const base = githubRawBase(testSrc);
    const testUrl = base + "_index.json";
    let ok = await tryFetchJson(testUrl);
    if (!ok){
      // _index.json optional — also accept if the repo itself is reachable at all
      const probeSym = AUTO_SYMBOLS[0], probeTf = AUTO_TIMEFRAMES[0];
      const probeFolder = `${probeSym}-${probeTf}`.toLowerCase();
      const probeFile = `${probeSym}_${probeTf}_${BULAN_FULL_UPPER[AUTO_START.month-1]}_${AUTO_START.year}.json`;
      ok = await tryFetchJson(`${base}${probeFolder}/${probeFile}`);
    }
    githubSource = testSrc;
    saveGithubSource(githubSource);
    updateGithubBtnState();
    if (ok){
      status.className = "modal-status show ok";
      status.textContent = "✓ Repo ditemukan, memuat data…";
    } else {
      status.className = "modal-status show err";
      status.textContent = "Repo/branch tidak ditemukan atau bukan repo publik — sumber tetap disimpan, coba periksa nama repo & branch.";
    }
    setTimeout(() => { el("githubModal").classList.add("hidden"); }, ok ? 500 : 1800);
    autoLoad();
  });

  function buildMonthList(){
    const now = new Date();
    const list = [];
    let y = AUTO_START.year, m = AUTO_START.month;
    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth()+1)){
      list.push({ year:y, month:m });
      m++; if (m>12){ m=1; y++; }
    }
    return list;
  }

  async function tryFetchJson(url){
    try{
      const res = await fetch(url, { cache:"no-store" });
      if (!res.ok) return null;
      return await res.json();
    }catch(err){
      return null; // file tidak ada / fetch diblokir browser (mode file://)
    }
  }

  async function autoLoad(){
    el("loadingOverlay").classList.remove("hidden");
    el("loadingOverlay").textContent = "Mencoba memuat otomatis…";
    updateGithubBtnState();

    const staging = {};
    let anyFound = false;

    const { base, index } = await resolveDataBase();

    if (Array.isArray(index) && index.length > 0){
      let done = 0;
      for (const entry of index){
        const url = `${base}${entry.folder}/${entry.file}`;
        const data = await tryFetchJson(url);
        done++;
        el("loadingOverlay").textContent = `Memuat ${done} / ${index.length} file (via _index.json)…`;
        if (data && data.symbol && data.timeframe && Array.isArray(data.candles) && data.candles.length){
          anyFound = true;
          if (!staging[data.symbol]) staging[data.symbol] = {};
          if (!staging[data.symbol][data.timeframe]) staging[data.symbol][data.timeframe] = [];
          staging[data.symbol][data.timeframe].push(...data.candles);
        }
        if (done % 5 === 0) await new Promise(r => setTimeout(r,0));
      }
    } else {
      const months = buildMonthList();
      const combos = [];
      AUTO_SYMBOLS.forEach(sym => AUTO_TIMEFRAMES.forEach(tf => months.forEach(mo => {
        combos.push({ sym, tf, mo });
      })));
      let done = 0;
      const batchSize = 24;
      for (let i=0;i<combos.length;i+=batchSize){
        const batch = combos.slice(i, i+batchSize);
        const results = await Promise.all(batch.map(async ({sym,tf,mo}) => {
          const folder = `${sym}-${tf}`.toLowerCase();
          const bulanNama = BULAN_FULL_UPPER[mo.month-1];
          const filename = `${sym}_${tf}_${bulanNama}_${mo.year}.json`;
          const data = await tryFetchJson(`${base}${folder}/${filename}`);
          return { sym, tf, data };
        }));
        results.forEach(({sym,tf,data}) => {
          if (data && Array.isArray(data.candles) && data.candles.length){
            anyFound = true;
            if (!staging[sym]) staging[sym] = {};
            if (!staging[sym][tf]) staging[sym][tf] = [];
            staging[sym][tf].push(...data.candles);
          }
        });
        done += batch.length;
        el("loadingOverlay").textContent = `Mencari data${base.startsWith("http")?" di GitHub":""}… (${Math.min(done,combos.length)} / ${combos.length} kombinasi dicoba)`;
      }
    }

    if (anyFound){
      for (const sym of Object.keys(staging)){
        for (const tf of Object.keys(staging[sym])){
          const merged = staging[sym][tf];
          merged.sort((a,b) => (a.timestamp||0) - (b.timestamp||0));
          const dedup = [];
          let lastTs = null;
          for (const c of merged){
            if (c.timestamp !== lastTs){ dedup.push(c); lastTs = c.timestamp; }
          }
          storeIntoLibrary({ symbol: sym, timeframe: tf, candles: dedup });
        }
      }
      renderWatchlist();
      const firstSymbol = Object.keys(library)[0];
      if (screens.length === 0) addScreen();
      if (firstSymbol){
        const firstTf = TF_ORDER.find(tf => library[firstSymbol][tf]) || Object.keys(library[firstSymbol])[0];
        loadIntoActiveScreen(firstSymbol, firstTf);
      }
      el("emptyState").classList.add("hidden");
      el("loadingOverlay").classList.add("hidden");
    } else {
      el("loadingOverlay").classList.add("hidden");
      el("emptyState").classList.remove("hidden");
      const ghHint = githubSource
        ? `<br><br>Sumber GitHub kamu saat ini: <b>${githubSource.user}/${githubSource.repo}</b> (branch <b>${githubSource.branch||"main"}</b>) — kalau ini salah, buka ikon ⚙ Pengaturan di kiri atas lalu klik "Sumber GitHub" untuk memperbaikinya. Pastikan repo-nya publik.`
        : `<br><br>Kalau data JSON kamu disimpan di repo GitHub (bukan di folder yang sama dengan index.html ini), buka ikon ⚙ <b>Pengaturan</b> di kiri atas topbar, klik <b>"Sumber GitHub"</b> dan isi username + nama repo-nya.`;
      el("emptyState").innerHTML = `
        <div class="big">Auto-load tidak menemukan data</div>
        <div class="small">
          Browser kamu kemungkinan memblokir akses file lokal langsung (umum terjadi di Chrome/Edge saat membuka file lewat <b>file://</b>).<br><br>
          <b>Solusi 1 (paling gampang):</b> klik tombol di bawah, lalu pilih folder tempat index.html ini berada.<br><br>
          <b>Solusi 2 (auto-load penuh):</b> jalankan lewat server lokal, buka terminal di folder ini lalu ketik:<br>
          <code style="background:var(--panel-alt);padding:2px 6px;border-radius:4px;">python -m http.server 8000</code><br>
          lalu buka <code style="background:var(--panel-alt);padding:2px 6px;border-radius:4px;">http://localhost:8000</code> di browser.
          ${ghHint}
        </div>
        <button id="emptyLoadBtn2">${iconSvg("folder")} Muat Folder Data</button>
      `;
      document.getElementById("emptyLoadBtn2").addEventListener("click", () => el("folderInput").click());
    }
  }

  /* ============================================================
     LOAD DATA (folder picker -> JSON files -> typed arrays)
     ============================================================ */
  el("loadBtn").addEventListener("click", () => el("folderInput").click());
  el("emptyLoadBtn").addEventListener("click", () => el("folderInput").click());
  el("folderInput").addEventListener("change", handleFiles);

  async function handleFiles(e){
    const files = Array.from(e.target.files || [])
      .filter(f => f.name.toLowerCase().endsWith(".json") && !f.name.startsWith("_"));
    if (files.length === 0){
      alert("Tidak ada file .json ditemukan di folder yang dipilih (termasuk di dalam subfolder).");
      return;
    }
    files.sort((a,b) => a.webkitRelativePath.localeCompare(b.webkitRelativePath));

    el("loadingOverlay").classList.remove("hidden");
    el("loadingOverlay").textContent = `Memuat 0 / ${files.length} file…`;

    const staging = {};

    let loaded = 0;
    let gagal = 0;
    for (const file of files){
      try{
        const text = await file.text();
        const data = JSON.parse(text);
        if (data && data.symbol && data.timeframe && Array.isArray(data.candles) && data.candles.length > 0){
          if (!staging[data.symbol]) staging[data.symbol] = {};
          if (!staging[data.symbol][data.timeframe]) staging[data.symbol][data.timeframe] = [];
          staging[data.symbol][data.timeframe].push(...data.candles);
        }
      }catch(err){
        gagal++;
        console.warn("Gagal parse", file.webkitRelativePath || file.name, err);
      }
      loaded++;
      el("loadingOverlay").textContent = `Memuat ${loaded} / ${files.length} file…`;
      if (loaded % 3 === 0) await new Promise(r => setTimeout(r, 0));
    }
    if (gagal > 0) console.warn(`${gagal} file gagal dibaca, lihat console untuk detail.`);

    el("loadingOverlay").textContent = "Menggabungkan & mengurutkan data…";
    await new Promise(r => setTimeout(r, 0));
    for (const sym of Object.keys(staging)){
      for (const tf of Object.keys(staging[sym])){
        const merged = staging[sym][tf];
        merged.sort((a,b) => (a.timestamp||0) - (b.timestamp||0));
        const dedup = [];
        let lastTs = null;
        for (const c of merged){
          if (c.timestamp !== lastTs){ dedup.push(c); lastTs = c.timestamp; }
        }
        storeIntoLibrary({ symbol: sym, timeframe: tf, candles: dedup });
      }
    }

    el("loadingOverlay").classList.add("hidden");
    renderWatchlist();

    if (screens.length === 0){
      const firstSymbol = Object.keys(library)[0];
      addScreen();
      if (firstSymbol){
        const firstTf = TF_ORDER.find(tf => library[firstSymbol][tf]) || Object.keys(library[firstSymbol])[0];
        loadIntoActiveScreen(firstSymbol, firstTf);
      }
    }
    el("emptyState").classList.toggle("hidden", Object.keys(library).length > 0);
  }

  function storeIntoLibrary(data){
    const raw = data.candles;
    const n = raw.length;
    const time = new Float64Array(n), open = new Float64Array(n), high = new Float64Array(n),
          low = new Float64Array(n), close = new Float64Array(n), volume = new Float64Array(n);
    for (let i=0;i<n;i++){
      const c = raw[i];
      time[i] = c.timestamp !== undefined ? c.timestamp : Math.floor(new Date(c.time).getTime()/1000);
      open[i] = c.open; high[i] = c.high; low[i] = c.low; close[i] = c.close; volume[i] = c.volume || 0;
    }
    if (!library[data.symbol]) library[data.symbol] = {};
    library[data.symbol][data.timeframe] = {
      n, time, open, high, low, close, volume,
      from: n ? new Date(time[0]*1000).toISOString() : null,
      to: n ? new Date(time[n-1]*1000).toISOString() : null,
      count: n
    };
  }

  el("clearBtn").addEventListener("click", () => {
    if (!confirm("Hapus semua data yang sudah dimuat dari memori?")) return;
    Object.keys(library).forEach(k => delete library[k]);
    screens = [];
    activeScreenId = null;
    renderWatchlist();
    renderTabs();
    updateTopbarForActiveScreen();
    draw();
    el("emptyState").classList.remove("hidden");
  });

  /* ============================================================
     WATCHLIST UI
     ============================================================ */
  function renderWatchlist(){
    const list = el("wlList");
    list.innerHTML = "";
    const symbols = Object.keys(library).sort();
    if (symbols.length === 0){
      list.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px;">Belum ada data. Muat folder "data" terlebih dulu.</div>';
      return;
    }
    symbols.forEach(sym => {
      const wrap = document.createElement("div");
      wrap.className = "wl-symbol";

      const head = document.createElement("div");
      head.className = "wl-symbol-head";
      const tfCount = Object.keys(library[sym]).length;
      head.innerHTML = `<span class="name">${sym}</span><span class="count">${tfCount} timeframe</span>`;
      wrap.appendChild(head);

      const row = document.createElement("div");
      row.className = "wl-tfrow";
      TF_ORDER.filter(tf => library[sym][tf]).forEach(tf => {
        const chip = document.createElement("span");
        chip.className = "wl-tf-chip";
        const active = getActiveScreen() && getActiveScreen().symbol === sym && getActiveScreen().timeframe === tf;
        if (active) chip.classList.add("loaded");
        chip.textContent = tf;
        chip.title = `${library[sym][tf].count.toLocaleString("id-ID")} candle`;
        chip.addEventListener("click", (ev) => {
          ev.stopPropagation();
          loadIntoActiveScreen(sym, tf);
        });
        row.appendChild(chip);
      });
      wrap.appendChild(row);
      head.addEventListener("click", () => { row.style.display = row.style.display === "none" ? "flex" : "none"; });
      list.appendChild(wrap);
    });
  }

  /* ============================================================
     SCREENS / TABS
     ============================================================ */
  function addScreen(){
    const scr = {
      id: nextScreenId++,
      symbol: null,
      timeframe: null,
      view: { end: 0, count: 140 },
      replay: { active:false, index:0, playing:false, timer:null }
    };
    screens.push(scr);
    activeScreenId = scr.id;
    renderTabs();
    updateTopbarForActiveScreen();
    draw();
    return scr;
  }

  function closeScreen(id){
    const idx = screens.findIndex(s => s.id === id);
    if (idx === -1) return;
    stopPlaying(screens[idx]);
    screens.splice(idx,1);
    if (screens.length === 0){
      addScreen();
      return;
    }
    if (activeScreenId === id) activeScreenId = screens[Math.max(0, idx-1)].id;
    renderTabs();
    updateTopbarForActiveScreen();
    draw();
  }

  function getActiveScreen(){
    return screens.find(s => s.id === activeScreenId) || null;
  }

  function renderTabs(){
    const bar = el("tabsbarInner");
    bar.innerHTML = "";
    screens.forEach((s, i) => {
      const tab = document.createElement("div");
      tab.className = "tab" + (s.id === activeScreenId ? " active" : "");
      const label = s.symbol ? `${s.symbol.replace(/c$/,"")} · ${s.timeframe}` : `Layar ${i+1}`;
      tab.innerHTML = `<span>${i+1}</span><span>${label}</span><span class="close">${iconSvg("close",12)}</span>`;
      tab.addEventListener("click", (ev) => {
        if (ev.target.classList.contains("close")){
          closeScreen(s.id);
          return;
        }
        activeScreenId = s.id;
        renderTabs();
        updateTopbarForActiveScreen();
        renderWatchlist();
        draw();
      });
      bar.appendChild(tab);
    });
    const addBtn = document.createElement("div");
    addBtn.id = "addTab";
    addBtn.textContent = "+";
    addBtn.title = "Tambah layar baru";
    addBtn.addEventListener("click", addScreen);
    bar.appendChild(addBtn);
  }

  function loadIntoActiveScreen(symbol, timeframe){
    let scr = getActiveScreen();
    if (!scr) scr = addScreen();
    if (!library[symbol] || !library[symbol][timeframe]) return;
    stopPlaying(scr);
    scr.symbol = symbol;
    scr.timeframe = timeframe;
    const n = library[symbol][timeframe].n;
    scr.view.end = n - 1;
    scr.view.count = Math.min(140, n);
    scr.replay.active = false;
    scr.replay.index = n - 1;
    renderTabs();
    updateTopbarForActiveScreen();
    renderWatchlist();
    refreshTradingUI();
  }

  /* ============================================================
     TIMEFRAME BUTTONS
     ============================================================ */
  function renderTfButtons(){
    const wrap = el("tfButtons");
    wrap.innerHTML = "";
    const scr = getActiveScreen();
    TF_ORDER.forEach(tf => {
      const btn = document.createElement("button");
      btn.className = "tfbtn";
      btn.textContent = tf;
      const available = scr && scr.symbol && library[scr.symbol] && library[scr.symbol][tf];
      if (!available) btn.classList.add("disabled");
      if (scr && scr.timeframe === tf) btn.classList.add("active");
      btn.addEventListener("click", () => {
        if (!scr || !scr.symbol) return;
        if (!library[scr.symbol][tf]) return;
        loadIntoActiveScreen(scr.symbol, tf);
      });
      wrap.appendChild(btn);
    });
  }

  function updateTopbarForActiveScreen(){
    const scr = getActiveScreen();
    el("symName").textContent = scr && scr.symbol ? scr.symbol : "— pilih pair —";
    el("symTf").textContent = scr && scr.timeframe ? scr.timeframe : "—";
    renderTfButtons();
    updateReplayUI();
    updateTicketUI();
  }

  /* ============================================================
     CHART DRAWING
     ============================================================ */
  function resizeCanvas(){
    const wrap = el("chartWrap");
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    chartCanvas.width = Math.floor(w * dpr);
    chartCanvas.height = Math.floor(h * dpr);
    chartCanvas.style.width = w + "px";
    chartCanvas.style.height = h + "px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
    draw();
  }
  window.addEventListener("resize", resizeCanvas);

  // Computes the (possibly fractional) candle window currently in view: startF/endF are the
  // exact float positions used for smooth, TradingView-style sub-candle panning & zooming;
  // start/end are the integer index bounds to actually iterate over when drawing.
  // endF is allowed to run past the last real candle (up to half a screen of empty space) so
  // the chart can be panned freely and doesn't feel "stuck" once it reaches the latest candle —
  // just like TradingView. `end` (used to actually iterate candles) stays hard-clamped so we
  // never try to draw data that doesn't exist / hasn't played yet during replay.
  function getViewGeom(scr, plotW){
    const d = library[scr.symbol][scr.timeframe];
    const lastIdx = scr.replay.active ? scr.replay.index : d.n - 1;
    const count = Math.max(20, Math.min(scr.view.count, d.n));
    const maxEndF = lastIdx + count * 0.5;
    let endF = Math.min(scr.view.end, maxEndF);
    endF = Math.max(Math.min(count - 1, lastIdx), endF);
    const startF = endF - count + 1;
    const start = Math.max(0, Math.floor(startF));
    const end = Math.min(lastIdx, Math.ceil(endF));
    const candleW = plotW / count;
    return { d, start, end, startF, endF, count, candleW, lastIdx };
  }

  // While replay is active, the viewport must never scroll past the current replay candle
  // (that would leak "future" candles that haven't played yet); once replay ends, the full
  // dataset is fair game. Either way we allow panning a bit past the last visible candle
  // (half a screen's worth) so the view never feels "stuck" at the edge — you can always
  // keep dragging freely, same as TradingView.
  function maxViewEnd(scr, d){
    const base = scr.replay.active ? scr.replay.index : d.n - 1;
    const count = Math.max(20, Math.min(scr.view.count, d.n));
    return base + count * 0.5;
  }

  // Batches redraws into the next animation frame so rapid-fire events (mousemove while
  // dragging, wheel zoom, touchmove) never queue up more than one draw per frame — this is
  // what makes panning/zooming feel smooth instead of janky.
  let drawScheduled = false;
  function requestDraw(){
    if (drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(() => { drawScheduled = false; draw(); });
  }

  /* ============================================================
     INDICATORS — EMA / SMA / RSI. Dihitung sekali per dataset lalu
     di-cache di objek data (d.__ind), baru dihitung ulang kalau
     panjang datanya berubah (mis. reload folder data).
     ============================================================ */
  function computeEMA(closes, period){
    const n = closes.length, out = new Array(n).fill(NaN);
    if (n < period) return out;
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i=0;i<period;i++) sum += closes[i];
    let prev = sum / period;
    out[period-1] = prev;
    for (let i=period;i<n;i++){ prev = closes[i]*k + prev*(1-k); out[i] = prev; }
    return out;
  }
  function computeSMA(closes, period){
    const n = closes.length, out = new Array(n).fill(NaN);
    let sum = 0;
    for (let i=0;i<n;i++){
      sum += closes[i];
      if (i >= period) sum -= closes[i-period];
      if (i >= period-1) out[i] = sum / period;
    }
    return out;
  }
  function computeRSI(closes, period){
    const n = closes.length, out = new Array(n).fill(NaN);
    if (n < period + 1) return out;
    let gain = 0, loss = 0;
    for (let i=1;i<=period;i++){
      const diff = closes[i] - closes[i-1];
      if (diff >= 0) gain += diff; else loss -= diff;
    }
    let avgGain = gain/period, avgLoss = loss/period;
    out[period] = avgLoss === 0 ? 100 : 100 - (100/(1+avgGain/avgLoss));
    for (let i=period+1;i<n;i++){
      const diff = closes[i] - closes[i-1];
      const g = diff > 0 ? diff : 0, l = diff < 0 ? -diff : 0;
      avgGain = (avgGain*(period-1) + g) / period;
      avgLoss = (avgLoss*(period-1) + l) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - (100/(1+avgGain/avgLoss));
    }
    return out;
  }
  function getIndicatorSeries(d, key){
    d.__ind = d.__ind || {};
    if (d.__ind[key] && d.__ind[key].length === d.n) return d.__ind[key];
    let arr;
    if (key === "ema20") arr = computeEMA(d.close, 20);
    else if (key === "ema50") arr = computeEMA(d.close, 50);
    else if (key === "sma50") arr = computeSMA(d.close, 50);
    else if (key === "rsi14") arr = computeRSI(d.close, 14);
    d.__ind[key] = arr;
    return arr;
  }
  function drawOverlayLine(series, color, start, end, startF, candleW, padL, priceToY){
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    let started = false;
    for (let i=start;i<=end;i++){
      const v = series[i];
      if (v === undefined || v === null || isNaN(v)){ started = false; continue; }
      const x = padL + (i - startF + 0.5) * candleW;
      const y = priceToY(v);
      if (!started){ ctx.moveTo(x,y); started = true; } else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.restore();
  }
  function drawRsiPanel(series, start, end, startF, candleW, padL, w, padR, top, bottom){
    const panelH = bottom - top;
    const valToY = (v) => top + (100 - v) / 100 * panelH;
    ctx.save();
    ctx.fillStyle = themeVar("--chart-panel-bg");
    ctx.fillRect(padL, top, w - padL - padR, panelH);
    ctx.strokeStyle = themeVar("--chart-grid");
    ctx.lineWidth = 1;
    [30,50,70].forEach(lvl => {
      const y = valToY(lvl);
      ctx.beginPath();
      ctx.setLineDash(lvl === 50 ? [] : [3,3]);
      ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.fillStyle = themeVar("--chart-axis");
    ctx.font = "10px " + getComputedStyle(document.documentElement).getPropertyValue("--mono");
    ctx.fillText("RSI 14", padL + 4, top + 11);
    ctx.strokeStyle = "#c98bff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let started = false;
    for (let i=start;i<=end;i++){
      const v = series[i];
      if (v === undefined || v === null || isNaN(v)){ started = false; continue; }
      const x = padL + (i - startF + 0.5) * candleW;
      const y = valToY(v);
      if (!started){ ctx.moveTo(x,y); started = true; } else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function draw(){
    const w = chartCanvas.clientWidth, h = chartCanvas.clientHeight;
    ctx.clearRect(0,0,w,h);
    const scr = getActiveScreen();
    lastDrawMeta = null;
    tradeLineHitboxes = [];
    pendingLineZones = [];
    if (!scr || !scr.symbol || !library[scr.symbol] || !library[scr.symbol][scr.timeframe]){
      return;
    }
    const padL = 8, padR = 68, padT = 16, padBBase = 26;
    const rsiActive = !!indicatorSettings.rsi14;
    const rsiPanelH = 60, rsiGap = 10;
    const padB = padBBase + (rsiActive ? rsiPanelH + rsiGap : 0);
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const geo = getViewGeom(scr, plotW);
    const { d, start, end, startF, candleW } = geo;
    if (end - start < 0) return;
    const spec = getSpec(scr.symbol);

    // price range: candles first...
    let lo = Infinity, hi = -Infinity;
    for (let i=start;i<=end;i++){
      if (d.low[i] < lo) lo = d.low[i];
      if (d.high[i] > hi) hi = d.high[i];
    }
    if (!isFinite(lo) || !isFinite(hi)) return;

    // ...then widen to always include open positions / SL / TP / pending orders for THIS
    // symbol+timeframe, so a trade line is never silently clipped off-canvas.
    const relevantPositions = positions.filter(p => p.status === "open" && p.symbol === scr.symbol && p.timeframe === scr.timeframe);
    const relevantPending = pendingOrders.filter(o => o.status === "pending" && o.symbol === scr.symbol && o.timeframe === scr.timeframe);
    relevantPositions.forEach(p => {
      lo = Math.min(lo, p.openPrice); hi = Math.max(hi, p.openPrice);
      if (p.sl != null){ lo = Math.min(lo, p.sl); hi = Math.max(hi, p.sl); }
      if (p.tp != null){ lo = Math.min(lo, p.tp); hi = Math.max(hi, p.tp); }
    });
    relevantPending.forEach(o => { lo = Math.min(lo, o.price); hi = Math.max(hi, o.price); });
    if (draftOrder && draftOrder.symbol === scr.symbol && draftOrder.timeframe === scr.timeframe){
      lo = Math.min(lo, draftOrder.entryPrice); hi = Math.max(hi, draftOrder.entryPrice);
      if (draftOrder.sl != null){ lo = Math.min(lo, draftOrder.sl); hi = Math.max(hi, draftOrder.sl); }
      if (draftOrder.tp != null){ lo = Math.min(lo, draftOrder.tp); hi = Math.max(hi, draftOrder.tp); }
    }

    const pad = (hi - lo) * 0.10 || 1;
    lo -= pad; hi += pad;

    // manual (drag-to-scale) price axis overrides the auto-fit range computed above,
    // like right-click-drag on a TradingView price axis
    if (scr.priceScale && scr.priceScale.mode === "manual"){
      lo = scr.priceScale.lo; hi = scr.priceScale.hi;
    }
    if (hi <= lo) hi = lo + 1;
    const priceToY = (p) => padT + (hi - p) / (hi - lo) * plotH;

    lastDrawMeta = { lo, hi, padT, padB, padL, padR, plotH, plotW, w, h, startF, candleW, start, end };

    // grid + price axis
    ctx.strokeStyle = themeVar("--chart-grid");
    ctx.fillStyle = themeVar("--chart-axis");
    ctx.font = "11px " + getComputedStyle(document.documentElement).getPropertyValue("--mono");
    ctx.lineWidth = 1;
    const gridLines = chartSettings.gridDensity;
    for (let g=0; g<=gridLines; g++){
      const price = lo + (hi - lo) * g / gridLines;
      const y = priceToY(price);
      if (chartSettings.showGrid){
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
      }
      ctx.fillText(fmtPrice(price, spec.digits), w - padR + 8, y + 3);
    }

    // candles / line
    if (chartType === "line"){
      ctx.save();
      ctx.strokeStyle = "#4f8cff";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      const fillPts = [];
      for (let i=start;i<=end;i++){
        const xCenter = padL + (i - startF + 0.5) * candleW;
        const y = priceToY(d.close[i]);
        if (!started){ ctx.moveTo(xCenter,y); started = true; } else ctx.lineTo(xCenter,y);
        fillPts.push([xCenter,y]);
      }
      ctx.stroke();
      if (fillPts.length > 1){
        const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
        grad.addColorStop(0, "rgba(79,140,255,.28)");
        grad.addColorStop(1, "rgba(79,140,255,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(fillPts[0][0], h - padB);
        fillPts.forEach(p => ctx.lineTo(p[0], p[1]));
        ctx.lineTo(fillPts[fillPts.length-1][0], h - padB);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    } else {
      for (let i=start;i<=end;i++){
        const xCenter = padL + (i - startF + 0.5) * candleW;
        if (xCenter < -candleW || xCenter > w + candleW) continue;
        const isUp = d.close[i] >= d.open[i];
        ctx.strokeStyle = isUp ? chartSettings.upColor : chartSettings.downColor;
        ctx.fillStyle = isUp ? chartSettings.upColor : chartSettings.downColor;

        ctx.beginPath();
        ctx.moveTo(xCenter, priceToY(d.high[i]));
        ctx.lineTo(xCenter, priceToY(d.low[i]));
        ctx.stroke();

        const yOpen = priceToY(d.open[i]);
        const yClose = priceToY(d.close[i]);
        const bodyTop = Math.min(yOpen, yClose);
        const bodyH = Math.max(1, Math.abs(yClose - yOpen));
        const bw = Math.max(1, candleW * 0.62);
        ctx.fillRect(xCenter - bw/2, bodyTop, bw, bodyH);
      }
    }

    // indicator overlays (EMA/SMA on the price chart, RSI in its own strip below) —
    // nonaktif secara default, hanya tergambar kalau diaktifkan lewat menu Indikator
    if (indicatorSettings.ema20) drawOverlayLine(getIndicatorSeries(d,"ema20"), "#2ea9ff", start, end, startF, candleW, padL, priceToY);
    if (indicatorSettings.ema50) drawOverlayLine(getIndicatorSeries(d,"ema50"), "#ff9f2e", start, end, startF, candleW, padL, priceToY);
    if (indicatorSettings.sma50) drawOverlayLine(getIndicatorSeries(d,"sma50"), "#c98bff", start, end, startF, candleW, padL, priceToY);
    if (rsiActive){
      const rsiTop = h - padBBase - rsiPanelH;
      const rsiBottom = h - padBBase - 2;
      drawRsiPanel(getIndicatorSeries(d,"rsi14"), start, end, startF, candleW, padL, w, padR, rsiTop, rsiBottom);
    }

    // live "current price" line — dashed, spans the chart, with a highlighted axis tag
    // (mirrors the last visible close on this screen; matches typical live platforms)
    const lastCloseIdx = geo.lastIdx;
    if (lastCloseIdx >= start - 1 && lastCloseIdx <= end + 1){
      const curPrice = d.close[Math.min(lastCloseIdx, d.n-1)];
      const curColor = d.close[lastCloseIdx] >= (d.open[lastCloseIdx] ?? d.close[lastCloseIdx]) ? chartSettings.upColor : chartSettings.downColor;
      const y = priceToY(curPrice);
      ctx.save();
      ctx.strokeStyle = curColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([2,3]);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.setLineDash([]);
      const boxH = 18, boxW = padR - 4;
      const clampedY = Math.max(4, Math.min(h-4, y));
      ctx.fillStyle = curColor;
      ctx.fillRect(w - padR + 2, clampedY - boxH/2, boxW, boxH);
      ctx.fillStyle = "#0a0d13";
      ctx.font = "bold 11px " + getComputedStyle(document.documentElement).getPropertyValue("--mono");
      ctx.textAlign = "left";
      ctx.fillText(fmtPrice(curPrice, spec.digits), w - padR + 7, clampedY + 4);
      ctx.restore();
    }

    // user drawings (trend lines / horizontal lines / rectangles)
    drawUserDrawings(priceToY, w, h, padL, padR, padT, padB);

    // open positions / pending orders belonging to this symbol+timeframe
    drawTradingLines(scr, priceToY, w, h, padL, padR, spec, start, end, startF, candleW);
    drawDraftOrder(scr, priceToY, w, h, padL, padR, padT, padB, spec);

    // crosshair + hover readout
    if (chartSettings.showCrosshair && hoverIndex !== null && hoverIndex >= start && hoverIndex <= end){
      const xCenter = padL + (hoverIndex - startF + 0.5) * candleW;
      ctx.strokeStyle = themeVar("--chart-crosshair");
      ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(xCenter,padT); ctx.lineTo(xCenter,h-padB); ctx.stroke();
      if (hoverPriceY !== null){
        ctx.beginPath(); ctx.moveTo(padL,hoverPriceY); ctx.lineTo(w-padR,hoverPriceY); ctx.stroke();
      }
      ctx.setLineDash([]);
      updateOhlcReadout(d, hoverIndex, spec);

      // crosshair price tag on the axis (TradingView-style grey pill following the cursor)
      if (hoverPriceY !== null){
        const hoverPrice = yToPrice(hoverPriceY);
        if (hoverPrice !== null){
          const boxH = 18, boxW = padR - 4;
          const clampedY = Math.max(4, Math.min(h-4, hoverPriceY));
          ctx.save();
          ctx.fillStyle = themeVar("--chart-tag-bg");
          ctx.fillRect(w - padR + 2, clampedY - boxH/2, boxW, boxH);
          ctx.fillStyle = themeVar("--chart-tag-text");
          ctx.font = "bold 11px " + getComputedStyle(document.documentElement).getPropertyValue("--mono");
          ctx.textAlign = "left";
          ctx.fillText(fmtPrice(hoverPrice, spec.digits), w - padR + 7, clampedY + 4);
          ctx.restore();
        }
      }
    } else {
      updateOhlcReadout(d, end, spec);
    }

    // x-axis time labels (a handful, evenly spaced)
    ctx.fillStyle = themeVar("--chart-axis");
    const labelCount = Math.min(6, end - start + 1);
    for (let k=0;k<labelCount;k++){
      const idx = start + Math.floor((end-start) * k/(labelCount-1 || 1));
      const x = padL + (idx - startF + 0.5) * candleW;
      ctx.fillText(fmtDateShort(d.time[idx]), Math.min(Math.max(x-26,padL), w-padR-60), h-8);
    }
  }

  function drawTradingLines(scr, priceToY, w, h, padL, padR, spec, start, end, startF, candleW){
    if (!scr || !scr.symbol) return;
    const relevantPositions = positions.filter(p => p.status === "open" && p.symbol === scr.symbol && p.timeframe === scr.timeframe);
    const relevantPending = pendingOrders.filter(o => o.status === "pending" && o.symbol === scr.symbol && o.timeframe === scr.timeframe);
    if (relevantPositions.length === 0 && relevantPending.length === 0) return;

    const now = performance.now();
    const xForIndex = (idx) => padL + (Math.max(start, Math.min(end, idx)) - startF + 0.5) * candleW;

    function drawLine(fromX, price, color, dashed, label, hitId, hitType, bold){
      const y = priceToY(price);
      const clampedY = Math.max(4, Math.min(h - 4, y)); // clamp label so it's always readable even if price is extreme
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = bold ? 1.6 : 1;
      ctx.setLineDash(dashed ? [5,4] : []);
      ctx.beginPath();
      ctx.moveTo(Math.max(padL, Math.min(w - padR, fromX)), y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.setLineDash([]);

      const boxH = 18;
      const boxW = padR - 4;
      const boxX = w - padR + 2, boxY = clampedY - boxH/2;
      ctx.fillStyle = color;
      ctx.fillRect(boxX, boxY, boxW - 14, boxH);
      ctx.fillStyle = "#0a0d13";
      ctx.font = "bold 10px " + getComputedStyle(document.documentElement).getPropertyValue("--mono");
      ctx.textAlign = "left";
      ctx.fillText(label, boxX+4, boxY+13);
      ctx.fillStyle = "rgba(0,0,0,.32)";
      ctx.fillRect(boxX+boxW-14, boxY, 14, boxH);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText("✕", boxX+boxW-7, boxY+13);
      ctx.textAlign = "left";
      ctx.restore();

      tradeLineHitboxes.push({ x1:boxX+boxW-14, y1:boxY, x2:boxX+boxW, y2:boxY+boxH, id:hitId, type:hitType });
    }

    function drawEntryMarker(x, y, type, color, ageMs){
      ctx.save();
      if (ageMs !== null && ageMs < 800){
        const t = ageMs / 800;
        ctx.globalAlpha = (1 - t) * 0.55;
        ctx.beginPath();
        ctx.arc(x, y, 7 + t*16, 0, Math.PI*2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      if (type === "buy"){ ctx.moveTo(x,y-9); ctx.lineTo(x-6,y+3); ctx.lineTo(x+6,y+3); }
      else { ctx.moveTo(x,y+9); ctx.lineTo(x-6,y-3); ctx.lineTo(x+6,y-3); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#0a0d13"; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }

    relevantPositions.forEach(p => {
      const color = p.type === "buy" ? "#17c964" : "#f5455c";
      const entryX = xForIndex(p.openIndex);
      const entryY = priceToY(p.openPrice);
      const pnl = calcPnL(p, priceForPosition(p));
      const pnlTxt = (pnl >= 0 ? "+$" : "-$") + Math.abs(pnl).toFixed(2);
      const label = `${p.type==="buy"?"BUY":"SELL"} ${p.volume.toFixed(2)}  ${pnlTxt}`;
      drawLine(entryX, p.openPrice, color, false, label, p.id, "close-pos", true);
      const ageMs = p.__openedAt !== undefined ? (now - p.__openedAt) : null;
      drawEntryMarker(entryX, entryY, p.type, color, ageMs);
      if (p.sl != null) drawLine(entryX, p.sl, "#f5455c", true, "SL "+fmtPrice(p.sl, spec.digits), p.id, "close-pos", false);
      if (p.tp != null) drawLine(entryX, p.tp, "#17c964", true, "TP "+fmtPrice(p.tp, spec.digits), p.id, "close-pos", false);
    });
    relevantPending.forEach(o => {
      drawLine(padL, o.price, "#ffb020", true, `${o.type.toUpperCase().replace("_"," ")} ${o.volume.toFixed(2)}`, o.id, "cancel-pending", false);
      pendingLineZones.push({ y: priceToY(o.price), id: o.id });
    });
  }

  // Draws the (unconfirmed) draft order preview: entry line + draggable SL/TP lines,
  // and positions the floating HTML ticket bar (#draftTicketBar) next to the entry line.
  function drawDraftOrder(scr, priceToY, w, h, padL, padR, padT, padB, spec){
    draftLineZones = [];
    const bar = el("draftTicketBar");
    if (!draftOrder || !scr || draftOrder.symbol !== scr.symbol || draftOrder.timeframe !== scr.timeframe){
      bar.classList.add("hidden");
      return;
    }

    function dashLine(price, color, label, dragType, bold){
      const y = priceToY(price);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = bold ? 1.6 : 1.2;
      ctx.setLineDash(bold ? [] : [6,4]);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.setLineDash([]);

      const clampedY = Math.max(4, Math.min(h - 4, y));
      const boxH = 18, boxW = padR - 4;
      const boxX = w - padR + 2, boxY = clampedY - boxH/2;
      ctx.fillStyle = color;
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = "#0a0d13";
      ctx.font = "bold 10px " + getComputedStyle(document.documentElement).getPropertyValue("--mono");
      ctx.textAlign = "left";
      ctx.fillText(label, boxX+4, boxY+13);
      ctx.textAlign = "left";
      ctx.restore();

      if (dragType) draftLineZones.push({ y, type: dragType });
      return y;
    }

    const color = draftOrder.type === "buy" ? "#17c964" : "#f5455c";
    const entryDragType = draftOrder.kind === "pending" ? "entry" : null;
    const entryLabel = (draftOrder.kind === "pending" ? draftOrder.pendingType.toUpperCase().replace("_"," ") : (draftOrder.type==="buy"?"BUY":"SELL")) + " " + fmtPrice(draftOrder.entryPrice, spec.digits);
    dashLine(draftOrder.entryPrice, "#4f8cff", entryLabel, entryDragType, true);
    let slY = null, tpY = null;
    if (draftOrder.sl != null) slY = dashLine(draftOrder.sl, "#f5455c", "SL "+fmtPrice(draftOrder.sl, spec.digits), "sl", false);
    if (draftOrder.tp != null) tpY = dashLine(draftOrder.tp, "#17c964", "TP "+fmtPrice(draftOrder.tp, spec.digits), "tp", false);

    // × button on the entry line to discard the draft, reusing the shared hitbox click-router
    const entryY = priceToY(draftOrder.entryPrice);
    const closeSize = 16;
    const closeX = w - padR - closeSize - 3, closeY = Math.max(4, Math.min(h-4, entryY)) - closeSize/2;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(closeX, closeY, closeSize, closeSize);
    ctx.fillStyle = "#fff";
    ctx.font = "11px " + getComputedStyle(document.documentElement).getPropertyValue("--mono");
    ctx.textAlign = "center";
    ctx.fillText("✕", closeX+closeSize/2, closeY+12);
    ctx.textAlign = "left";
    ctx.restore();
    tradeLineHitboxes.push({ x1:closeX, y1:closeY, x2:closeX+closeSize, y2:closeY+closeSize, id:null, type:"cancel-draft" });

    // position the floating HTML ticket bar near the entry line
    bar.classList.remove("hidden");
    const barTop = Math.max(padT + 4, Math.min(h - padB - 34, entryY - 17));
    bar.style.top = barTop + "px";
    bar.style.left = (padL + 24) + "px";
    bar.style.transform = "none";
  }

  function updateOhlcReadout(d, idx, spec){
    if (idx === undefined || idx < 0 || idx >= d.n) return;
    el("ohO").textContent = fmtPrice(d.open[idx], spec.digits);
    el("ohH").textContent = fmtPrice(d.high[idx], spec.digits);
    el("ohL").textContent = fmtPrice(d.low[idx], spec.digits);
    el("ohC").textContent = fmtPrice(d.close[idx], spec.digits);
    const chg = d.close[idx] - d.open[idx];
    const pct = d.open[idx] !== 0 ? (chg / d.open[idx] * 100) : 0;
    const chgEl = el("ohChg");
    chgEl.textContent = (chg>=0?"+":"") + fmtPrice(chg, spec.digits) + " (" + (pct>=0?"+":"") + pct.toFixed(2) + "%)";
    chgEl.className = chg >= 0 ? "chg-up" : "chg-down";
  }

  function yToPrice(y){
    if (!lastDrawMeta) return null;
    const m = lastDrawMeta;
    return m.hi - (y - m.padT) / m.plotH * (m.hi - m.lo);
  }
  function priceToYPx(price){
    if (!lastDrawMeta) return null;
    const m = lastDrawMeta;
    return m.padT + (m.hi - price) / (m.hi - m.lo) * m.plotH;
  }
  function xToIdxF(x){
    if (!lastDrawMeta) return null;
    const m = lastDrawMeta;
    return m.startF + (x - m.padL) / m.candleW;
  }
  function idxToXPx(idx){
    if (!lastDrawMeta) return null;
    const m = lastDrawMeta;
    return m.padL + (idx - m.startF + 0.5) * m.candleW;
  }

  /* ============================================================
     DRAWING TOOLS (trend line / horizontal line / rectangle)
     ============================================================ */
  function getDrawings(){
    if (!activeScreenId) return [];
    if (!drawings[activeScreenId]) drawings[activeScreenId] = [];
    return drawings[activeScreenId];
  }
  function setDrawTool(tool){
    drawTool = tool;
    activeDrawingDraft = null;
    document.querySelectorAll(".dtool[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === tool));
    chartCanvas.classList.toggle("drawing", tool !== "cursor");
    if (tool !== "cursor") selectedDrawingId = null;
    requestDraw();
  }
  document.querySelectorAll(".dtool[data-tool]").forEach(btn => {
    btn.addEventListener("click", () => setDrawTool(btn.dataset.tool));
  });
  /* ---------- hide/show all drawings (toolbar "mata") ---------- */
  el("toggleDrawingsBtn").addEventListener("click", () => {
    drawingsHidden = !drawingsHidden;
    el("toggleDrawingsBtn").classList.toggle("active", drawingsHidden);
    el("toggleDrawingsBtn").title = drawingsHidden ? "Tampilkan semua gambar" : "Sembunyikan / tampilkan semua gambar";
    const iconSpan = el("toggleDrawingsBtn").querySelector("[data-icon]");
    iconSpan.setAttribute("data-icon", drawingsHidden ? "eyeoff" : "eye");
    iconSpan.innerHTML = iconSvg(drawingsHidden ? "eyeoff" : "eye", 15);
    requestDraw();
  });

  /* ---------- trash popover: 2 pilihan — Hapus Indikator / Hapus Seluruh Gambar ---------- */
  el("clearDrawBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const pop = el("clearPopover");
    const willOpen = pop.classList.contains("hidden");
    if (willOpen){
      const hasIndicator = Object.values(indicatorSettings).some(Boolean);
      const hasDrawings = !!(activeScreenId && getDrawings().length);
      el("clearIndicatorBtn").disabled = !hasIndicator;
      el("clearAllDrawingsBtn").disabled = !hasDrawings;
    }
    pop.classList.toggle("hidden");
    el("clearDrawBtn").classList.toggle("active", !pop.classList.contains("hidden"));
  });
  document.addEventListener("click", (e) => {
    const pop = el("clearPopover");
    if (pop.classList.contains("hidden")) return;
    if (e.target.closest("#clearPopover") || e.target.closest("#clearDrawBtn")) return;
    pop.classList.add("hidden");
    el("clearDrawBtn").classList.remove("active");
  });
  el("clearIndicatorBtn").addEventListener("click", () => {
    if (el("clearIndicatorBtn").disabled) return;
    indicatorSettings = { ema20:false, ema50:false, sma50:false, rsi14:false };
    ["indEma20Chk","indEma50Chk","indSma50Chk","indRsi14Chk"].forEach(id => { el(id).checked = false; });
    updateIndicatorButtonState();
    requestDraw();
    el("clearPopover").classList.add("hidden");
    el("clearDrawBtn").classList.remove("active");
  });
  el("clearAllDrawingsBtn").addEventListener("click", () => {
    if (el("clearAllDrawingsBtn").disabled) return;
    if (!activeScreenId || !getDrawings().length) return;
    drawings[activeScreenId] = [];
    selectedDrawingId = null;
    requestDraw();
    el("clearPopover").classList.add("hidden");
    el("clearDrawBtn").classList.remove("active");
  });

  /* ---------- indicator popover (RSI / EMA / SMA — nonaktif sampai dicentang) ---------- */
  function updateIndicatorButtonState(){
    const any = Object.values(indicatorSettings).some(Boolean);
    el("indicatorToggleBtn").classList.toggle("active", any);
  }
  el("indicatorToggleBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    el("indicatorPopover").classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    const pop = el("indicatorPopover");
    if (pop.classList.contains("hidden")) return;
    if (e.target.closest("#indicatorPopover") || e.target.closest("#indicatorToggleBtn")) return;
    pop.classList.add("hidden");
  });
  function wireIndicatorChk(id, key){
    el(id).addEventListener("change", () => {
      indicatorSettings[key] = el(id).checked;
      updateIndicatorButtonState();
      requestDraw();
    });
  }
  wireIndicatorChk("indEma20Chk", "ema20");
  wireIndicatorChk("indEma50Chk", "ema50");
  wireIndicatorChk("indSma50Chk", "sma50");
  wireIndicatorChk("indRsi14Chk", "rsi14");
  el("chartTypeBtn").addEventListener("click", () => {
    chartType = chartType === "candle" ? "line" : "candle";
    el("chartTypeBtn").classList.toggle("active", chartType === "line");
    el("chartTypeBtn").innerHTML = iconSvg(chartType === "candle" ? "candlestick" : "linechart");
    requestDraw();
  });

  /* ============================================================
     RIGHT-CLICK CONTEXT MENU (grid / chart type / colors / reset)
     ============================================================ */
  const ctxMenu = el("chartCtxMenu");

  function syncCtxMenuState(){
    document.querySelectorAll('input[name="ctxChartType"]').forEach(r => { r.checked = r.value === chartType; });
    el("ctxShowGrid").checked = chartSettings.showGrid;
    el("ctxGridDensity").value = String(chartSettings.gridDensity);
    el("ctxShowCrosshair").checked = chartSettings.showCrosshair;
    const scr = getActiveScreen();
    el("ctxAutoScale").checked = !scr || !scr.priceScale || scr.priceScale.mode !== "manual";
    el("ctxUpColor").value = chartSettings.upColor;
    el("ctxDownColor").value = chartSettings.downColor;
    el("ctxDeleteDrawing").classList.toggle("hidden", !ctxMenuTarget);
  }

  function openContextMenu(clientX, clientY){
    syncCtxMenuState();
    ctxMenu.classList.remove("hidden");
    // measure then clamp inside viewport
    const mw = ctxMenu.offsetWidth || 236, mh = ctxMenu.offsetHeight || 300;
    const x = Math.min(clientX, window.innerWidth - mw - 8);
    const y = Math.min(clientY, window.innerHeight - mh - 8);
    ctxMenu.style.left = Math.max(4,x) + "px";
    ctxMenu.style.top = Math.max(4,y) + "px";
  }
  function closeContextMenu(){
    ctxMenu.classList.add("hidden");
    ctxMenuTarget = null;
  }

  chartCanvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    const rect = chartCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const dHit = findDrawingHitAt(mx,my);
    ctxMenuTarget = dHit ? { drawingId: dHit.id } : null;
    if (dHit){ selectedDrawingId = dHit.id; requestDraw(); }
    openContextMenu(e.clientX, e.clientY);
  });
  document.addEventListener("click", (e) => {
    if (!ctxMenu.classList.contains("hidden") && !ctxMenu.contains(e.target)) closeContextMenu();
  });
  window.addEventListener("blur", closeContextMenu);
  window.addEventListener("resize", closeContextMenu);

  document.querySelectorAll('input[name="ctxChartType"]').forEach(r => {
    r.addEventListener("change", () => {
      if (!r.checked) return;
      chartType = r.value;
      el("chartTypeBtn").classList.toggle("active", chartType === "line");
      el("chartTypeBtn").innerHTML = iconSvg(chartType === "candle" ? "candlestick" : "linechart");
      requestDraw();
    });
  });
  el("ctxShowGrid").addEventListener("change", () => {
    chartSettings.showGrid = el("ctxShowGrid").checked;
    requestDraw();
  });
  el("ctxGridDensity").addEventListener("change", () => {
    chartSettings.gridDensity = parseInt(el("ctxGridDensity").value, 10) || 6;
    requestDraw();
  });
  el("ctxShowCrosshair").addEventListener("change", () => {
    chartSettings.showCrosshair = el("ctxShowCrosshair").checked;
    requestDraw();
  });
  el("ctxAutoScale").addEventListener("change", () => {
    const scr = getActiveScreen();
    if (!scr) return;
    scr.priceScale = el("ctxAutoScale").checked ? { mode:"auto" } : { mode:"manual", lo:lastDrawMeta?lastDrawMeta.lo:0, hi:lastDrawMeta?lastDrawMeta.hi:1 };
    requestDraw();
  });
  el("ctxUpColor").addEventListener("input", () => {
    chartSettings.upColor = el("ctxUpColor").value;
    candleColorsCustomized = true;
    requestDraw();
  });
  el("ctxDownColor").addEventListener("input", () => {
    chartSettings.downColor = el("ctxDownColor").value;
    candleColorsCustomized = true;
    requestDraw();
  });
  function resetChartView(){
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    const d = library[scr.symbol][scr.timeframe];
    scr.view.end = scr.replay.active ? scr.replay.index : d.n - 1;
    scr.view.count = Math.min(140, d.n);
    scr.priceScale = { mode: "auto" };
    requestDraw();
  }
  el("ctxResetView").addEventListener("click", () => {
    resetChartView();
    closeContextMenu();
  });
  el("autoFitBtn").addEventListener("click", resetChartView);
  el("ctxDeleteDrawing").addEventListener("click", () => {
    if (ctxMenuTarget){
      const list = getDrawings();
      const i = list.findIndex(x => x.id === ctxMenuTarget.drawingId);
      if (i !== -1) list.splice(i,1);
      selectedDrawingId = null;
    }
    requestDraw();
    closeContextMenu();
  });
  el("ctxClearDrawings").addEventListener("click", () => {
    if (activeScreenId && getDrawings().length && confirm("Hapus semua gambar di chart ini?")){
      drawings[activeScreenId] = [];
      selectedDrawingId = null;
      requestDraw();
    }
    closeContextMenu();
  });

  const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const FIB_COLORS = ["#787b86","#f23645","#ff9800","#4caf50","#089981","#2962ff","#787b86"];

  function drawUserDrawings(priceToY, w, h, padL, padR, padT, padB){
    drawingHitboxes = [];
    if (drawingsHidden) return;
    const list = getDrawings();
    const items = activeDrawingDraft ? [...list, activeDrawingDraft] : list;
    const scrForSpec = getActiveScreen();
    const spec = scrForSpec && scrForSpec.symbol ? getSpec(scrForSpec.symbol) : { digits: 2 };
    items.forEach(dr => {
      const isSelected = dr.id === selectedDrawingId;
      const x1 = idxToXPx(dr.p1.idx), y1 = priceToY(dr.p1.price);
      let x2, y2;
      if (dr.type === "hline"){ x2 = w - padR; y2 = y1; }
      else { x2 = idxToXPx(dr.p2.idx); y2 = priceToY(dr.p2.price); }

      ctx.save();
      ctx.strokeStyle = isSelected ? "#ffb020" : "#4f8cff";
      ctx.lineWidth = isSelected ? 2 : 1.4;

      if (dr.type === "rect"){
        const rx = Math.min(x1,x2), ry = Math.min(y1,y2), rw = Math.abs(x2-x1), rh = Math.abs(y2-y1);
        ctx.fillStyle = isSelected ? "rgba(255,176,32,.10)" : "rgba(79,140,255,.10)";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);
      } else if (dr.type === "hline"){
        ctx.setLineDash([6,4]);
        ctx.beginPath(); ctx.moveTo(padL, y1); ctx.lineTo(x2, y1); ctx.stroke();
        ctx.setLineDash([]);
      } else if (dr.type === "fib"){
        const fx1 = Math.min(x1,x2), fx2 = Math.max(x1,x2);
        FIB_LEVELS.forEach((lv, i) => {
          const price = dr.p1.price + (dr.p2.price - dr.p1.price) * lv;
          const y = priceToY(price);
          ctx.strokeStyle = isSelected ? "#ffb020" : FIB_COLORS[i % FIB_COLORS.length];
          ctx.lineWidth = (lv === 0 || lv === 1) ? 1.6 : 1;
          ctx.beginPath(); ctx.moveTo(fx1, y); ctx.lineTo(fx2, y); ctx.stroke();
          ctx.font = "11px -apple-system,Segoe UI,Roboto,sans-serif";
          ctx.fillStyle = ctx.strokeStyle;
          ctx.textBaseline = "bottom";
          ctx.fillText(`${(lv*100).toFixed(1)}%  ${price.toFixed(spec.digits)}`, fx2 + 4, y - 2);
        });
        const yTop = priceToY(Math.max(dr.p1.price, dr.p2.price));
        const yBot = priceToY(Math.min(dr.p1.price, dr.p2.price));
        ctx.fillStyle = "rgba(79,140,255,.05)";
        ctx.fillRect(fx1, yTop, fx2-fx1, yBot-yTop);
      } else { // trend
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      }
      ctx.restore();

      if (dr.id != null){
        // handles for selected drawing, and hit-box registration for all drawings (body drag)
        if (dr.type === "rect" || dr.type === "fib"){
          drawingHitboxes.push({ id:dr.id, kind: dr.type === "fib" ? "body-fib" : "body-rect", x1:Math.min(x1,x2), y1:Math.min(y1,y2), x2:Math.max(x1,x2), y2:Math.max(y1,y2) });
        } else if (dr.type === "hline"){
          drawingHitboxes.push({ id:dr.id, kind:"body-hline", y: y1, x1: padL, x2: x2 });
        } else {
          drawingHitboxes.push({ id:dr.id, kind:"body-line", x1,y1,x2,y2 });
        }
        if (isSelected){
          [["p1",x1,y1]].concat(dr.type==="hline" ? [] : [["p2",x2,y2]]).forEach(([handle,hx,hy]) => {
            ctx.save();
            ctx.fillStyle = "#ffb020";
            ctx.beginPath(); ctx.arc(hx,hy,5,0,Math.PI*2); ctx.fill();
            ctx.strokeStyle = "#0a0d13"; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.restore();
            drawingHitboxes.push({ id:dr.id, kind:"handle-"+handle, x1:hx-7,y1:hy-7,x2:hx+7,y2:hy+7 });
          });
        }
      }
    });
  }

  function distToSegment(px,py,x1,y1,x2,y2){
    const dx=x2-x1, dy=y2-y1;
    const len2 = dx*dx+dy*dy;
    let t = len2 ? ((px-x1)*dx+(py-y1)*dy)/len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x1+t*dx, cy = y1+t*dy;
    return Math.hypot(px-cx, py-cy);
  }
  function findDrawingHitAt(mx,my){
    // handles first (topmost priority), then bodies
    const handles = drawingHitboxes.filter(hb => hb.kind.startsWith("handle-"));
    for (const hb of handles){ if (mx>=hb.x1&&mx<=hb.x2&&my>=hb.y1&&my<=hb.y2) return hb; }
    for (const hb of drawingHitboxes){
      if (hb.kind === "body-rect" || hb.kind === "body-fib"){
        if (mx>=hb.x1-4&&mx<=hb.x2+4&&my>=hb.y1-4&&my<=hb.y2+4){
          const nearEdge = mx<=hb.x1+4||mx>=hb.x2-4||my<=hb.y1+4||my>=hb.y2-4;
          if (nearEdge || (mx>hb.x1&&mx<hb.x2&&my>hb.y1&&my<hb.y2)) return hb;
        }
      } else if (hb.kind === "body-hline"){
        if (mx>=hb.x1 && mx<=hb.x2 && Math.abs(my-hb.y) <= 5) return hb;
      } else if (hb.kind === "body-line"){
        if (distToSegment(mx,my,hb.x1,hb.y1,hb.x2,hb.y2) <= 6) return hb;
      }
    }
    return null;
  }

  /* ============================================================
     MOUSE: hover / pan / zoom (anchored on cursor, TradingView-style) / pick-start / pick-price
     / price-axis drag-to-scale
     ============================================================ */
  let lastMoveTime = 0, lastMoveX = 0, dragVelocity = 0;
  const AXIS_W = 68; // must match padR used in draw()

  const DRAFT_LINE_HIT_PX = 6;
  function findDraftLineZoneAt(my){
    return draftLineZones.find(z => Math.abs(z.y - my) <= DRAFT_LINE_HIT_PX) || null;
  }

  chartCanvas.addEventListener("mousemove", (e) => {
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    const d = library[scr.symbol][scr.timeframe];
    const rect = chartCanvas.getBoundingClientRect();
    const padL = 8, padR = AXIS_W;
    const plotW = rect.width - padL - padR;
    const geo = getViewGeom(scr, plotW);
    const candleW = geo.candleW;
    const x = e.clientX - rect.left - padL;
    const my = e.clientY - rect.top;
    let idx = Math.floor(geo.startF + x / candleW);
    idx = Math.max(0, Math.min(d.n - 1, idx));
    hoverIndex = idx;
    hoverPriceY = my;

    const mxNow = x + padL;

    if (activeDrawingDraft){
      const price = yToPrice(my);
      const fidx = xToIdxF(mxNow);
      if (price !== null && fidx !== null) activeDrawingDraft.p2 = { idx: fidx, price };
      requestDraw();
      return;
    }

    if (drawingDragState){
      const price = yToPrice(my);
      const fidx = xToIdxF(mxNow);
      const dr = getDrawings().find(z => z.id === drawingDragState.id);
      if (dr && price !== null && fidx !== null){
        if (drawingDragState.mode === "handle"){
          dr[drawingDragState.handle] = { idx: fidx, price };
        } else if (drawingDragState.mode === "move"){
          const startPrice = yToPrice(drawingDragState.startMy);
          const startIdx = xToIdxF(drawingDragState.startMx);
          if (startPrice !== null && startIdx !== null){
            const dIdx = fidx - startIdx;
            const dPrice = price - startPrice;
            dr.p1 = { idx: drawingDragState.origP1.idx + dIdx, price: drawingDragState.origP1.price + dPrice };
            dr.p2 = { idx: drawingDragState.origP2.idx + dIdx, price: drawingDragState.origP2.price + dPrice };
          }
        }
      }
      requestDraw();
      return;
    }

    if (dragState && dragState.mode === "draft-sl"){
      const price = yToPrice(my);
      if (price !== null) updateDraftSL(price);
      requestDraw();
      return;
    }
    if (dragState && dragState.mode === "draft-tp"){
      const price = yToPrice(my);
      if (price !== null) updateDraftTP(price);
      requestDraw();
      return;
    }
    if (dragState && dragState.mode === "draft-entry"){
      const price = yToPrice(my);
      if (price !== null) updateDraftEntry(price);
      requestDraw();
      return;
    }
    if (dragState && dragState.mode === "reprice-pending"){
      const price = yToPrice(my);
      const o = pendingOrders.find(x => x.id === dragState.id);
      if (o && price !== null){
        const delta = price - o.price;
        o.price = price;
        if (o.sl != null) o.sl += delta;
        if (o.tp != null) o.tp += delta;
      }
      renderBacktestBody();
      requestDraw();
      return;
    }

    if (dragState && dragState.mode === "scale-y"){
      const dy = my - dragState.startY;
      // dragging down = zoom out (wider range), dragging up = zoom in — same feel as TradingView
      const factor = Math.exp(dy * 0.006);
      const mid = (dragState.startLo + dragState.startHi) / 2;
      const halfRange = (dragState.startHi - dragState.startLo) / 2 * factor;
      scr.priceScale = { mode: "manual", lo: mid - halfRange, hi: mid + halfRange };
      requestDraw();
      return;
    }

    if (dragState && dragState.mode === "pan"){
      // Incremental (per-frame) delta instead of "total distance since mousedown" — this is
      // what makes the pan never feel "stuck": each frame just nudges the view from wherever
      // it currently is, so hitting a boundary never builds up a drag debt that has to be
      // undone before movement resumes in the other direction.
      const dx = e.clientX - dragState.lastX;
      const shiftCandles = -dx / candleW;
      scr.view.end = Math.max(scr.view.count-1, Math.min(maxViewEnd(scr, d), scr.view.end + shiftCandles));
      if (lastDrawMeta && lastDrawMeta.plotH){
        const dy = e.clientY - dragState.lastY;
        const priceRange = lastDrawMeta.hi - lastDrawMeta.lo;
        const priceDelta = dy * priceRange / lastDrawMeta.plotH;
        const curLo = scr.priceScale && scr.priceScale.mode === "manual" ? scr.priceScale.lo : lastDrawMeta.lo;
        const curHi = scr.priceScale && scr.priceScale.mode === "manual" ? scr.priceScale.hi : lastDrawMeta.hi;
        scr.priceScale = { mode: "manual", lo: curLo + priceDelta, hi: curHi + priceDelta };
      }
      dragState.lastX = e.clientX;
      dragState.lastY = e.clientY;
      const now = performance.now();
      if (lastMoveTime){
        const dt = now - lastMoveTime;
        if (dt > 0) dragVelocity = dx / dt;
      }
      lastMoveTime = now; lastMoveX = e.clientX;
    } else if (!dragState){
      const overAxis = x + padL > rect.width - padR;
      chartCanvas.classList.toggle("dragging-line", !!findDraftLineZoneAt(my) && !overAxis);
      chartCanvas.classList.toggle("scale-axis", overAxis);
    }
    requestDraw();
  });
  chartCanvas.addEventListener("mouseleave", () => { hoverIndex = null; hoverPriceY = null; requestDraw(); });

  chartCanvas.addEventListener("mousedown", (e) => {
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    const rect = chartCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    const hit = tradeLineHitboxes.find(hb => mx>=hb.x1 && mx<=hb.x2 && my>=hb.y1 && my<=hb.y2);
    if (hit){
      if (hit.type === "close-pos") manualClosePosition(hit.id);
      else if (hit.type === "cancel-pending") cancelPendingOrder(hit.id);
      else if (hit.type === "cancel-draft") cancelDraftOrder();
      return;
    }

    // ---- drawing tools ----
    if (drawTool !== "cursor" && mx < rect.width - AXIS_W){
      const idx = xToIdxF(mx);
      const price = yToPrice(my);
      if (idx === null || price === null) return;
      if (drawTool === "hline"){
        getDrawings().push({ id: nextDrawingId++, type:"hline", p1:{idx,price}, p2:{idx,price} });
        setDrawTool("cursor");
        return;
      }
      if (!activeDrawingDraft){
        activeDrawingDraft = { id:null, type: drawTool, p1:{idx,price}, p2:{idx,price} };
      } else {
        const list = getDrawings();
        list.push({ id: nextDrawingId++, type: activeDrawingDraft.type, p1: activeDrawingDraft.p1, p2:{idx,price} });
        activeDrawingDraft = null;
        setDrawTool("cursor");
      }
      requestDraw();
      return;
    }
    if (drawTool === "cursor" && mx < rect.width - AXIS_W){
      const dHit = findDrawingHitAt(mx,my);
      if (dHit){
        selectedDrawingId = dHit.id;
        const dr = getDrawings().find(x => x.id === dHit.id);
        if (dr){
          if (dHit.kind === "handle-p1" || dHit.kind === "handle-p2"){
            drawingDragState = { mode:"handle", id:dr.id, handle: dHit.kind === "handle-p1" ? "p1" : "p2" };
          } else {
            drawingDragState = { mode:"move", id:dr.id, startMx:mx, startMy:my,
              origP1:{...dr.p1}, origP2:{...dr.p2} };
          }
          chartCanvas.classList.add("moving-drawing");
        }
        requestDraw();
        return;
      } else if (selectedDrawingId !== null){
        selectedDrawingId = null;
        requestDraw();
      }
    }

    const lineZone = findDraftLineZoneAt(my);
    if (lineZone && mx < rect.width - AXIS_W){
      dragState = { mode: lineZone.type === "sl" ? "draft-sl" : lineZone.type === "tp" ? "draft-tp" : "draft-entry" };
      chartCanvas.classList.add("dragging-line");
      return;
    }

    const pendZone = pendingLineZones.find(z => Math.abs(z.y - my) <= DRAFT_LINE_HIT_PX);
    if (pendZone && mx < rect.width - AXIS_W){
      dragState = { mode: "reprice-pending", id: pendZone.id };
      chartCanvas.classList.add("dragging-line");
      return;
    }

    if (pickMode){
      if (hoverIndex !== null){ startReplayAt(scr, hoverIndex); setPickMode(false); }
      return;
    }
    if (pendingPickMode){
      const price = yToPrice(my);
      if (price !== null){
        const spec = getSpec(scr.symbol);
        el("pendingPrice").value = price.toFixed(spec.digits);
      }
      pendingPickMode = false;
      el("pickPriceBtn").classList.remove("active");
      chartCanvas.classList.remove("picking");
      return;
    }

    // dragging inside the price-axis gutter (right edge) manually rescales price, like
    // right-click-drag on a TradingView y-axis; anywhere else on the chart pans in time.
    if (mx >= rect.width - AXIS_W && lastDrawMeta){
      dragState = { mode: "scale-y", startY: my, startLo: lastDrawMeta.lo, startHi: lastDrawMeta.hi };
      chartCanvas.classList.add("scale-axis");
      return;
    }

    dragState = { mode: "pan", lastX: e.clientX, lastY: e.clientY };
    dragVelocity = 0; lastMoveTime = 0;
    chartCanvas.classList.add("panning");
    chartCanvas.classList.add("free-panning");
  });

  chartCanvas.addEventListener("dblclick", (e) => {
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    const rect = chartCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    if (mx >= rect.width - AXIS_W){
      scr.priceScale = { mode: "auto" };
    } else {
      const d = library[scr.symbol][scr.timeframe];
      scr.view.end = scr.replay.active ? scr.replay.index : d.n - 1;
      scr.view.count = Math.min(140, d.n);
    }
    requestDraw();
  });

  window.addEventListener("mouseup", () => {
    chartCanvas.classList.remove("panning");
    chartCanvas.classList.remove("dragging-line");
    chartCanvas.classList.remove("scale-axis");
    chartCanvas.classList.remove("moving-drawing");
    chartCanvas.classList.remove("free-panning");
    if (drawingDragState){ drawingDragState = null; }
    if (dragState){
      const wasPan = dragState.mode === "pan";
      dragState = null;
      if (wasPan) applyInertia();
    }
    lastMoveTime = 0;
  });

  function applyInertia(){
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    let vel = dragVelocity;
    dragVelocity = 0;
    if (Math.abs(vel) < 0.03) return;
    const d = library[scr.symbol][scr.timeframe];
    function step(){
      vel *= 0.90;
      if (Math.abs(vel) < 0.02) return;
      const rect = chartCanvas.getBoundingClientRect();
      const plotW = rect.width - 8 - AXIS_W;
      const geo = getViewGeom(scr, plotW);
      if (geo.candleW <= 0) return;
      const shiftCandles = -vel * 16 / geo.candleW; // continuous, no rounding
      scr.view.end = Math.max(scr.view.count-1, Math.min(maxViewEnd(scr, d), scr.view.end + shiftCandles));
      requestDraw();
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  chartCanvas.addEventListener("wheel", (e) => {
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    e.preventDefault();
    const d = library[scr.symbol][scr.timeframe];
    const rect = chartCanvas.getBoundingClientRect();
    const padL = 8, padR = AXIS_W;
    const plotW = rect.width - padL - padR;
    const geo = getViewGeom(scr, plotW);
    const mouseX = e.clientX - rect.left - padL;
    const idxUnderMouse = geo.startF + mouseX / geo.candleW;

    // Normalize deltaY across mouse wheels (large, discrete steps) and trackpads (small,
    // continuous steps) so zoom speed is proportional to the actual gesture, not a fixed jump.
    const deltaY = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaY;
    const factor = Math.exp(Math.max(-140, Math.min(140, deltaY)) * 0.0018);
    const newCount = Math.max(20, Math.min(d.n, Math.round(scr.view.count * factor)));
    const relPos = geo.count > 0 ? (idxUnderMouse - geo.startF) / geo.count : 0.5;
    const newEnd = idxUnderMouse + (1 - relPos) * newCount - 1;

    scr.view.count = newCount;
    scr.view.end = Math.max(newCount - 1, Math.min(maxViewEnd(scr, d), newEnd));
    requestDraw();
  }, { passive:false });

  /* ---------- touch: single-finger pan, two-finger pinch zoom ---------- */
  let pinchStartDist = null, pinchStartCount = null;
  let pinchStartCenter = null, pinchStartEnd = null, pinchStartLo = null, pinchStartHi = null, pinchStartPlotH = null;
  chartCanvas.addEventListener("touchstart", (e) => {
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    if (e.touches.length === 1){
      dragState = { mode: "pan", lastX: e.touches[0].clientX, lastY: e.touches[0].clientY };
    } else if (e.touches.length === 2){
      dragState = null;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.hypot(dx, dy);
      pinchStartCount = scr.view.count;
      pinchStartCenter = { x:(e.touches[0].clientX+e.touches[1].clientX)/2, y:(e.touches[0].clientY+e.touches[1].clientY)/2 };
      pinchStartEnd = scr.view.end;
      pinchStartLo = lastDrawMeta ? lastDrawMeta.lo : null;
      pinchStartHi = lastDrawMeta ? lastDrawMeta.hi : null;
      pinchStartPlotH = lastDrawMeta ? lastDrawMeta.plotH : null;
    }
  }, { passive:true });

  chartCanvas.addEventListener("touchmove", (e) => {
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    const d = library[scr.symbol][scr.timeframe];
    if (e.touches.length === 1 || e.touches.length === 2) e.preventDefault();
    if (e.touches.length === 1 && dragState && dragState.mode === "pan"){
      const rect = chartCanvas.getBoundingClientRect();
      const plotW = rect.width - 8 - AXIS_W;
      const geo = getViewGeom(scr, plotW);
      const dx = e.touches[0].clientX - dragState.lastX;
      const shiftCandles = -dx / geo.candleW; // continuous, sub-candle precision
      scr.view.end = Math.max(scr.view.count-1, Math.min(maxViewEnd(scr, d), scr.view.end + shiftCandles));
      if (lastDrawMeta && lastDrawMeta.plotH){
        const dy = e.touches[0].clientY - dragState.lastY;
        const priceRange = lastDrawMeta.hi - lastDrawMeta.lo;
        const priceDelta = dy * priceRange / lastDrawMeta.plotH;
        const curLo = scr.priceScale && scr.priceScale.mode === "manual" ? scr.priceScale.lo : lastDrawMeta.lo;
        const curHi = scr.priceScale && scr.priceScale.mode === "manual" ? scr.priceScale.hi : lastDrawMeta.hi;
        scr.priceScale = { mode: "manual", lo: curLo + priceDelta, hi: curHi + priceDelta };
      }
      dragState.lastX = e.touches[0].clientX;
      dragState.lastY = e.touches[0].clientY;
      requestDraw();
    } else if (e.touches.length === 2 && pinchStartDist){
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = pinchStartDist / Math.max(1, dist);
      scr.view.count = Math.max(20, Math.min(d.n, Math.round(pinchStartCount * factor)));

      // two-finger drag also pans time + price together (translate by center-point movement)
      if (pinchStartCenter){
        const rect = chartCanvas.getBoundingClientRect();
        const plotW = rect.width - 8 - AXIS_W;
        const geo = getViewGeom(scr, plotW);
        const curCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const curCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const dxC = curCenterX - pinchStartCenter.x;
        const shiftCandles = -dxC / geo.candleW;
        scr.view.end = Math.max(scr.view.count-1, Math.min(maxViewEnd(scr, d), pinchStartEnd + shiftCandles));
        if (pinchStartLo != null && pinchStartHi != null && pinchStartPlotH){
          const dyC = curCenterY - pinchStartCenter.y;
          const priceRange = pinchStartHi - pinchStartLo;
          const priceDelta = dyC * priceRange / pinchStartPlotH;
          scr.priceScale = { mode: "manual", lo: pinchStartLo + priceDelta, hi: pinchStartHi + priceDelta };
        }
      }
      requestDraw();
    }
  }, { passive:false });

  chartCanvas.addEventListener("touchend", () => {
    dragState = null; pinchStartDist = null; pinchStartCenter = null;
  });

  window.addEventListener("keydown", (e) => {
    const typingInField = ["INPUT","SELECT","TEXTAREA"].includes(document.activeElement && document.activeElement.tagName);
    if (e.key === "Escape"){
      if (!ctxMenu.classList.contains("hidden")) closeContextMenu();
      if (pickMode) setPickMode(false);
      if (pendingPickMode){
        pendingPickMode = false;
        el("pickPriceBtn").classList.remove("active");
        chartCanvas.classList.remove("picking");
      }
      if (draftOrder) cancelDraftOrder();
      if (activeDrawingDraft || drawTool !== "cursor") setDrawTool("cursor");
      if (selectedDrawingId !== null){ selectedDrawingId = null; requestDraw(); }
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedDrawingId !== null && !typingInField){
      e.preventDefault();
      const list = getDrawings();
      const i = list.findIndex(x => x.id === selectedDrawingId);
      if (i !== -1) list.splice(i,1);
      selectedDrawingId = null;
      requestDraw();
    }
  });

  /* ============================================================
     REPLAY CONTROLS
     ============================================================ */
  function setPickMode(on){
    pickMode = on;
    el("pickStartBtn").classList.toggle("active", on);
    el("replayShortcutBtn").classList.toggle("active", on);
    el("pickModeBanner").classList.toggle("hidden", !on);
  }
  el("pickStartBtn").addEventListener("click", () => setPickMode(!pickMode));
  el("replayShortcutBtn").addEventListener("click", () => {
    const scr = getActiveScreen();
    if (!scr || !scr.symbol){ alert("Pilih pair terlebih dahulu di Watchlist."); return; }
    setPickMode(!pickMode);
  });

  function startReplayAt(scr, idx){
    stopPlaying(scr);
    const d = library[scr.symbol][scr.timeframe];
    scr.replay.active = true;
    scr.replay.index = Math.max(0, Math.min(d.n - 1, idx));
    scr.view.end = scr.replay.index;
    updateReplayUI();
    refreshTradingUI();
  }

  function stopPlaying(scr){
    if (!scr) return;
    scr.replay.playing = false;
    if (scr.replay.timer){ clearInterval(scr.replay.timer); scr.replay.timer = null; }
    el("playBtn").classList.remove("playing");
    el("playBtn").innerHTML = iconSvg("play");
  }

  function togglePlay(){
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    if (!scr.replay.active) startReplayAt(scr, Math.max(0, Math.round(library[scr.symbol][scr.timeframe].n * 0.7)));
    if (scr.replay.playing){
      stopPlaying(scr);
      return;
    }
    scr.replay.playing = true;
    el("playBtn").classList.add("playing");
    el("playBtn").innerHTML = iconSvg("pause");
    const tick = () => {
      const d = library[scr.symbol][scr.timeframe];
      if (scr.replay.index >= d.n - 1){ stopPlaying(scr); return; }
      const prevIdx = scr.replay.index;
      scr.replay.index++;
      // Shift the viewport by the same delta instead of snapping to replay.index — this
      // preserves any manual pan the user did, so dragging still works mid-playback.
      scr.view.end += (scr.replay.index - prevIdx);
      processBarsForward(scr.symbol, scr.timeframe, prevIdx, scr.replay.index);
      updateReplayUI();
      refreshTradingUI();
    };
    const speed = parseFloat(el("speedSel").value);
    scr.replay.timer = setInterval(tick, Math.max(30, 700 * speed));
  }
  el("playBtn").addEventListener("click", togglePlay);

  el("speedSel").addEventListener("change", () => {
    const scr = getActiveScreen();
    if (scr && scr.replay.playing){ stopPlaying(scr); togglePlay(); }
  });

  el("stepBackBtn").addEventListener("click", () => {
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    stopPlaying(scr);
    if (!scr.replay.active) startReplayAt(scr, library[scr.symbol][scr.timeframe].n - 1);
    const prevIdx = scr.replay.index;
    scr.replay.index = Math.max(0, scr.replay.index - 1);
    scr.view.end += (scr.replay.index - prevIdx);
    updateReplayUI(); refreshTradingUI();
  });
  el("stepFwdBtn").addEventListener("click", () => {
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    stopPlaying(scr);
    const d = library[scr.symbol][scr.timeframe];
    if (!scr.replay.active) startReplayAt(scr, 0);
    const prevIdx = scr.replay.index;
    scr.replay.index = Math.min(d.n - 1, scr.replay.index + 1);
    scr.view.end += (scr.replay.index - prevIdx);
    processBarsForward(scr.symbol, scr.timeframe, prevIdx, scr.replay.index);
    updateReplayUI(); refreshTradingUI();
  });

  el("exitReplayBtn").addEventListener("click", () => {
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    stopPlaying(scr);
    scr.replay.active = false;
    scr.view.end = library[scr.symbol][scr.timeframe].n - 1;
    setPickMode(false);
    updateReplayUI(); refreshTradingUI();
  });

  el("scrubBar").addEventListener("input", (e) => {
    const scr = getActiveScreen();
    if (!scr || !scr.symbol) return;
    stopPlaying(scr);
    const d = library[scr.symbol][scr.timeframe];
    const frac = parseInt(e.target.value,10) / 1000;
    const idx = Math.round(frac * (d.n - 1));
    const oldIdx = scr.replay.active ? scr.replay.index : -1;
    scr.replay.active = true;
    scr.replay.index = idx;
    scr.view.end = idx;
    if (idx > oldIdx) processBarsForward(scr.symbol, scr.timeframe, oldIdx, idx);
    updateReplayUI(); refreshTradingUI();
  });

  function updateReplayUI(){
    const scr = getActiveScreen();
    const hasData = scr && scr.symbol && library[scr.symbol] && library[scr.symbol][scr.timeframe];
    ["stepBackBtn","stepFwdBtn","playBtn","pickStartBtn","exitReplayBtn","speedSel","scrubBar"].forEach(id => {
      el(id).disabled = !hasData;
    });
    // jendela replay selalu standby (tampil) selama replay aktif di screen ini, dan
    // tombol "Replay" di topbar menyala (glow) sepanjang sesi replay berlangsung —
    // bukan cuma saat mode "pilih titik awal" saja.
    el("replayFloat").classList.toggle("hidden", !hasData || !scr.replay.active);
    el("replayShortcutBtn").classList.toggle("replay-live", !!(hasData && scr.replay.active));
    if (!hasData){
      el("posText").textContent = "0 / 0";
      el("dateText").textContent = "—";
      el("scrubFill").style.width = "0%";
      el("scrubHead").style.left = "0%";
      return;
    }
    const d = library[scr.symbol][scr.timeframe];
    const idx = scr.replay.active ? scr.replay.index : d.n - 1;
    el("posText").textContent = `${idx+1} / ${d.n}`;
    el("dateText").textContent = fmtDateFull(d.time[idx]);
    const frac = d.n > 1 ? idx / (d.n - 1) : 0;
    el("scrubFill").style.width = (frac*100) + "%";
    el("scrubHead").style.left = (frac*100) + "%";
    el("scrubBar").value = Math.round(frac*1000);
    el("exitReplayBtn").disabled = !scr.replay.active;
  }

  /* ---------- replay floating panel: draggable within #chartWrap ---------- */
  (function setupReplayFloatDrag(){
    const panel = el("replayFloat");
    const handle = panel.querySelector(".rf-handle");
    const wrap = el("chartWrap");
    let dragging = false, offX = 0, offY = 0;

    function beginDrag(clientX, clientY){
      dragging = true;
      panel.style.transform = "none";
      panel.style.bottom = "auto";
      const rect = panel.getBoundingClientRect();
      offX = clientX - rect.left; offY = clientY - rect.top;
    }
    function moveDrag(clientX, clientY){
      if (!dragging) return;
      const wrapRect = wrap.getBoundingClientRect();
      let x = clientX - wrapRect.left - offX;
      let y = clientY - wrapRect.top - offY;
      x = Math.max(4, Math.min(wrapRect.width - panel.offsetWidth - 4, x));
      y = Math.max(4, Math.min(wrapRect.height - panel.offsetHeight - 4, y));
      panel.style.left = x + "px";
      panel.style.top = y + "px";
    }

    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest(".rf-repick")) return; // don't start a drag from the repick button
      beginDrag(e.clientX, e.clientY);
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => moveDrag(e.clientX, e.clientY));
    window.addEventListener("mouseup", () => { dragging = false; });

    handle.addEventListener("touchstart", (e) => {
      if (e.target.closest(".rf-repick")) return;
      const t = e.touches[0];
      beginDrag(t.clientX, t.clientY);
    }, { passive:true });
    window.addEventListener("touchmove", (e) => {
      if (!dragging) return;
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
    }, { passive:true });
    window.addEventListener("touchend", () => { dragging = false; });
  })();

  /* ============================================================
     THEME SYSTEM — Liquid Glass / Neumorphism, each dark+light.
     Persisted in localStorage; picked from the Pengaturan popover
     or quick-toggled (mode only) from the topbar moon icon.
     ============================================================ */
  const THEME_KEY = "alhaza_theme_pref_v1";
  const THEME_DEFAULT_CANDLES = {
    "glass-dark":  { up: "#2be08e", down: "#ff5c72" },
    "glass-light": { up: "#0fa968", down: "#e23350" },
    "neumo-light": { up: "#149463", down: "#d63c56" },
    "neumo-dark":  { up: "#33d489", down: "#ff6478" }
  };
  let themePref = { theme: "neumo", mode: "light" };

  function loadThemePref(){
    try{
      const raw = localStorage.getItem(THEME_KEY);
      if (raw){
        const parsed = JSON.parse(raw);
        if (parsed && parsed.theme && parsed.mode) return parsed;
      }
    }catch(err){ /* ignore */ }
    return { theme: "neumo", mode: "light" };
  }
  function saveThemePref(pref){
    try{ localStorage.setItem(THEME_KEY, JSON.stringify(pref)); }catch(err){ /* ignore */ }
  }

  function applyTheme(theme, mode, opts){
    opts = opts || {};
    themePref = { theme, mode };
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-mode", mode);
    saveThemePref(themePref);

    // sync swatch active state + quick-toggle icon
    document.querySelectorAll(".theme-swatch").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.theme === theme && btn.dataset.mode === mode);
    });
    const quickBtn = el("themeQuickToggleBtn");
    if (quickBtn) quickBtn.title = mode === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap";

    // candle colors follow the theme unless the user has manually picked their own
    if (!candleColorsCustomized && !opts.keepCandleColors){
      const key = theme + "-" + mode;
      const defaults = THEME_DEFAULT_CANDLES[key];
      if (defaults){
        chartSettings.upColor = defaults.up;
        chartSettings.downColor = defaults.down;
        const upInput = el("ctxUpColor"), downInput = el("ctxDownColor");
        if (upInput) upInput.value = defaults.up;
        if (downInput) downInput.value = defaults.down;
      }
    }
    requestDraw();
    drawSparkline((computeStats()||{}).curveR);
  }

  function initThemeSystem(){
    const pref = loadThemePref();
    applyTheme(pref.theme, pref.mode);

    document.querySelectorAll(".theme-swatch").forEach(btn => {
      btn.addEventListener("click", () => applyTheme(btn.dataset.theme, btn.dataset.mode));
    });
    const quickBtn = el("themeQuickToggleBtn");
    if (quickBtn){
      quickBtn.addEventListener("click", () => {
        applyTheme(themePref.theme, themePref.mode === "dark" ? "light" : "dark");
      });
    }
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init(){
    initThemeSystem();
    mountIcons();
    resizeCanvas();
    renderWatchlist();
    renderTabs();
    updateTopbarForActiveScreen();
    updateGithubBtnState();
    refreshTradingUI();
    setInterval(() => {
      const scr = getActiveScreen();
      if (scr) updateReplayUI();
      updateAccountUI();
      updateTicketUI();
      if (!el("wlPanelBacktest").classList.contains("hidden")){ renderBacktestBody(); updateSummaryUI(); }
    }, 1000);
    autoLoad(); // langsung coba baca folder data begitu halaman dibuka
  }
  init();

})();
