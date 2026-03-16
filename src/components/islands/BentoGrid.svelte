<script lang="ts">
  import SparklineCard from "./SparklineCard.svelte";
  import { slide } from "svelte/transition";
  import { onMount } from "svelte";

  type TimeRange = "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y";

  type MarketMeta = {
    prevClose: number;
    open: number;
    volume: number;
    low: number;
    high: number;
    yearLow: number;
    yearHigh: number;
  };

  type MarketPayload = {
    symbol: string;
    range: TimeRange;
    price: number;
    changeAmount: number;
    changePercent: number;
    rangeBase: number;
    historicalData: number[];
    meta: MarketMeta;
  };

  type SparklineTicker = {
    name: string;
    symbol: string;
    price: number;
    changeAmount: number;
    changePercent: number;
    data: number[];
    meta: MarketMeta | null;
    loading: boolean;
  };

  type DetailTicker = SparklineTicker & {
    rangeBase: number;
    range: TimeRange;
  };

  type CompareSeries = {
    symbol: string;
    name: string;
    color: string;
    normalizedData: number[];
    changePercent: number;
  };

  type ChartLine = {
    key: string;
    name: string;
    color: string;
    data: number[];
    fill: boolean;
    changePercent: number;
  };

  const TIMEFRAME_OPTIONS: TimeRange[] = ["1D", "5D", "1M", "6M", "YTD", "1Y"];
  const RANGE_SUMMARY: Record<TimeRange, string> = {
    "1D": "Intraday move",
    "5D": "Past 5 trading days",
    "1M": "Past month",
    "6M": "Past 6 months",
    "YTD": "Year to date",
    "1Y": "Past 12 months"
  };
  const SYMBOL_LABELS: Record<string, string> = {
    "^GSPC": "S&P 500",
    "^DJI": "Dow Jones",
    "^IXIC": "Nasdaq",
    "GC=F": "Gold",
    "CL=F": "Crude Oil",
    "BTC-USD": "Bitcoin",
    "ETH-USD": "Ethereum"
  };
  const COMPARISON_COLORS: Record<string, string> = {
    "^GSPC": "#38bdf8",
    "^IXIC": "#f59e0b",
    "^DJI": "#a78bfa",
    "BTC-USD": "#f97316",
    "ETH-USD": "#22d3ee"
  };
  const PRIMARY_COMPARE_COLOR = "#f8fafc";
  const baseUrl = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL;

  // selectedTicker → controls {#if} visibility (can be null, triggers outro)
  // displayTicker  → frozen data snapshot for template reads (never null once set, safe during outro)
  let selectedTicker: SparklineTicker | null = null;
  let displayTicker: DetailTicker | null = null;
  let streamIsLive = false;
  let checkingStream = true;
  let activeFeedCategory = 'youtube';
  let youtubeVideos: any[] = [];
  let showExpandedFeed = false;
  let activeRange: TimeRange = "1D";
  let detailLoading = false;
  let compareLoading = false;
  let detailError = "";
  let compareEnabled = false;
  let comparisonSeries: CompareSeries[] = [];
  let marketDataCache: Record<string, MarketPayload> = {};
  let detailRequestToken = 0;
  let compareRequestToken = 0;

  let sparklines: SparklineTicker[] = [
    { name: "S&P 500",   symbol: "^GSPC",   price: 0, changeAmount: 0, changePercent: 0, data: [], meta: null, loading: true },
    { name: "Dow Jones", symbol: "^DJI",    price: 0, changeAmount: 0, changePercent: 0, data: [], meta: null, loading: true },
    { name: "Nasdaq",    symbol: "^IXIC",   price: 0, changeAmount: 0, changePercent: 0, data: [], meta: null, loading: true },
    { name: "Gold",      symbol: "GC=F",    price: 0, changeAmount: 0, changePercent: 0, data: [], meta: null, loading: true },
    { name: "Crude Oil", symbol: "CL=F",    price: 0, changeAmount: 0, changePercent: 0, data: [], meta: null, loading: true },
    { name: "Bitcoin",   symbol: "BTC-USD", price: 0, changeAmount: 0, changePercent: 0, data: [], meta: null, loading: true },
    { name: "Ethereum",  symbol: "ETH-USD", price: 0, changeAmount: 0, changePercent: 0, data: [], meta: null, loading: true }
  ];

  function formatVolume(vol?: number) {
    if (!vol) return "0";
    if (vol >= 1000000000) return (vol / 1000000000).toFixed(2) + "B";
    if (vol >= 1000000)    return (vol / 1000000).toFixed(2) + "M";
    if (vol >= 1000)       return (vol / 1000).toFixed(2) + "K";
    return vol.toLocaleString();
  }

  function getSvgPath(data: number[], min: number, max: number, isArea: boolean) {
    if (!data || data.length < 2) return "";
    const range = max - min || 1;
    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * 1000;
      const y = 250 - (((v - min) / range) * 250);
      return `${x},${y}`;
    });
    const line = `M ${points.join(" L ")}`;
    return isArea ? `${line} L 1000,250 L 0,250 Z` : line;
  }

  function getTickerName(symbol: string) {
    return SYMBOL_LABELS[symbol] ?? sparklines.find((ticker) => ticker.symbol === symbol)?.name ?? symbol;
  }

  function getCacheKey(symbol: string, range: TimeRange) {
    return `${symbol}::${range}`;
  }

  function normalizeSeries(data: number[], base: number) {
    if (!data.length) return [];
    const safeBase = base || data[0] || 1;
    return data.map((value) => ((value - safeBase) / safeBase) * 100);
  }

  function getComparisonSymbols(symbol: string) {
    if (symbol === "BTC-USD" || symbol === "ETH-USD") {
      return ["BTC-USD", "ETH-USD"].filter((candidate) => candidate !== symbol);
    }

    return ["^GSPC", "^IXIC", "^DJI"].filter((candidate) => candidate !== symbol);
  }

  function getChartBounds(seriesCollection: number[][], baseline?: number) {
    const values = seriesCollection.flat().filter((value) => Number.isFinite(value));
    if (typeof baseline === "number" && Number.isFinite(baseline)) {
      values.push(baseline);
    }

    if (!values.length) {
      return { min: 0, max: 1 };
    }

    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
      const pad = Math.abs(min) * 0.05 || 1;
      min -= pad;
      max += pad;
    } else {
      const pad = (max - min) * 0.08;
      min -= pad;
      max += pad;
    }

    return { min, max };
  }

  function getChartOffset(value: number, min: number, max: number) {
    const range = max - min || 1;
    const clamped = Math.min(max, Math.max(min, value));
    return ((max - clamped) / range) * 100;
  }

  function toDetailTicker(payload: MarketPayload, name: string): DetailTicker {
    return {
      name,
      symbol: payload.symbol,
      price: payload.price,
      changeAmount: payload.changeAmount,
      changePercent: payload.changePercent,
      data: payload.historicalData,
      meta: payload.meta,
      loading: false,
      rangeBase: payload.rangeBase,
      range: payload.range
    };
  }

  function toCompareSeries(payload: MarketPayload): CompareSeries {
    return {
      symbol: payload.symbol,
      name: getTickerName(payload.symbol),
      color: COMPARISON_COLORS[payload.symbol] ?? "#38bdf8",
      normalizedData: normalizeSeries(payload.historicalData, payload.rangeBase),
      changePercent: payload.changePercent
    };
  }

  async function fetchMarketData(symbol: string, range: TimeRange = "1D") {
    const cacheKey = getCacheKey(symbol, range);
    if (marketDataCache[cacheKey]) {
      return marketDataCache[cacheKey];
    }

    const response = await fetch(`${baseUrl}/api/market-data?symbol=${encodeURIComponent(symbol)}&range=${range}`);
    const payload = await response.json();

    if (!response.ok || payload.error) {
      throw new Error(payload.message || payload.error || `Failed to fetch ${symbol}`);
    }

    marketDataCache = {
      ...marketDataCache,
      [cacheKey]: payload
    };

    return payload as MarketPayload;
  }

  async function loadTickerDetail(symbol: string, name: string, range: TimeRange) {
    const token = ++detailRequestToken;
    detailLoading = true;
    detailError = "";

    try {
      const payload = await fetchMarketData(symbol, range);
      if (token !== detailRequestToken || selectedTicker?.symbol !== symbol) return;
      displayTicker = toDetailTicker(payload, name);
    } catch (error: any) {
      if (token !== detailRequestToken) return;
      detailError = error?.message || "Failed to load chart";
    } finally {
      if (token === detailRequestToken) {
        detailLoading = false;
      }
    }
  }

  async function loadComparisonSeries(symbol: string, range: TimeRange) {
    const symbols = getComparisonSymbols(symbol);
    const token = ++compareRequestToken;
    comparisonSeries = [];
    compareLoading = symbols.length > 0;

    if (!symbols.length) {
      compareLoading = false;
      return;
    }

    try {
      const payloads = await Promise.all(symbols.map((compareSymbol) => fetchMarketData(compareSymbol, range)));
      if (token !== compareRequestToken || selectedTicker?.symbol !== symbol || !compareEnabled) return;
      comparisonSeries = payloads.map((payload) => toCompareSeries(payload));
    } catch (error) {
      if (token !== compareRequestToken) return;
      console.error("Failed to load comparison series", error);
      comparisonSeries = [];
    } finally {
      if (token === compareRequestToken) {
        compareLoading = false;
      }
    }
  }

  function resetExpandedTickerState() {
    activeRange = "1D";
    detailLoading = false;
    compareLoading = false;
    detailError = "";
    compareEnabled = false;
    comparisonSeries = [];
  }

  function toggleTicker(sl: SparklineTicker) {
    if (selectedTicker && selectedTicker.symbol === sl.symbol) {
      detailRequestToken += 1;
      compareRequestToken += 1;
      selectedTicker = null;
      // displayTicker intentionally NOT cleared here — it stays non-null
      // so template reads during the slide-out outro never hit null.meta
      resetExpandedTickerState();
    } else {
      // Shallow-clone to decouple from sparklines array mutations
      resetExpandedTickerState();
      displayTicker = {
        ...sl,
        rangeBase: sl.meta?.prevClose ?? (sl.price - sl.changeAmount),
        range: "1D"
      };
      selectedTicker = sl;
      showExpandedFeed = false; // close grid if opening ticker

      if (!sl.data.length || !sl.meta) {
        void loadTickerDetail(sl.symbol, sl.name, "1D");
      }
    }
  }

  async function handleRangeChange(range: TimeRange) {
    if (!selectedTicker) return;
    if (activeRange === range && !detailError) return;

    activeRange = range;
    await Promise.all([
      loadTickerDetail(selectedTicker.symbol, selectedTicker.name, range),
      compareEnabled ? loadComparisonSeries(selectedTicker.symbol, range) : Promise.resolve()
    ]);
  }

  async function toggleCompareOverlay() {
    if (!selectedTicker) return;

    if (compareEnabled) {
      compareRequestToken += 1;
      compareEnabled = false;
      compareLoading = false;
      comparisonSeries = [];
      return;
    }

    compareEnabled = true;
    await loadComparisonSeries(selectedTicker.symbol, activeRange);
  }

  function handleVideoAction(videoId: string, action: 'hide' | 'save') {
    // Optimistic UI updates
    if (action === 'hide') {
      youtubeVideos = youtubeVideos.filter(v => v.videoId !== videoId);
    } else if (action === 'save') {
      youtubeVideos = youtubeVideos.map(v => 
        v.videoId === videoId ? { ...v, isSaved: !v.isSaved } : v
      );
    }

    const baseUrl = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL;
    fetch(`${baseUrl}/api/feed/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, action })
    }).catch(err => console.error("Action error", err));
  }

  $: absoluteBaseline = displayTicker?.rangeBase ?? ((displayTicker?.price ?? 0) - (displayTicker?.changeAmount ?? 0));
  $: detailCaption = compareEnabled
    ? `${RANGE_SUMMARY[activeRange]} · normalized compare`
    : RANGE_SUMMARY[activeRange];
  $: compareButtonLabel = compareLoading
    ? "Loading compare..."
    : compareEnabled
      ? "Hide compare"
      : (displayTicker?.symbol === "BTC-USD" || displayTicker?.symbol === "ETH-USD")
        ? "Compare BTC / ETH"
        : "Compare Big 3";
  $: chartLines = !displayTicker
    ? []
    : compareEnabled
      ? ([
          {
            key: displayTicker.symbol,
            name: displayTicker.name,
            color: PRIMARY_COMPARE_COLOR,
            data: normalizeSeries(displayTicker.data ?? [], absoluteBaseline),
            fill: false,
            changePercent: displayTicker.changePercent ?? 0
          },
          ...comparisonSeries.map((series) => ({
            key: series.symbol,
            name: series.name,
            color: series.color,
            data: series.normalizedData,
            fill: false,
            changePercent: series.changePercent
          }))
        ] as ChartLine[])
      : ([
          {
            key: displayTicker.symbol,
            name: displayTicker.name,
            color: (displayTicker.changeAmount ?? 0) >= 0 ? "#4ade80" : "#f87171",
            data: displayTicker.data ?? [],
            fill: true,
            changePercent: displayTicker.changePercent ?? 0
          }
        ] as ChartLine[]);
  $: baselineValue = compareEnabled ? 0 : absoluteBaseline;
  $: chartBounds = getChartBounds(chartLines.map((line) => line.data), baselineValue);
  $: baselineTop = getChartOffset(baselineValue, chartBounds.min, chartBounds.max);
  $: baselineLabel = compareEnabled
    ? "0.00%"
    : `${activeRange === "1D" ? "Prev close" : "Range start"}: $${absoluteBaseline.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  $: lowMetricLabel = activeRange === "1D" ? "Low" : "Range Low";
  $: highMetricLabel = activeRange === "1D" ? "High" : "Range High";
  $: primaryAreaFill = (displayTicker?.changeAmount ?? 0) >= 0 ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)";

  onMount(() => {
    Promise.allSettled(sparklines.map((sl) => fetchMarketData(sl.symbol, "1D")))
      .then((results) => {
        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            const data = result.value;
            sparklines[index] = {
              ...sparklines[index],
              price: data.price,
              changeAmount: data.changeAmount,
              changePercent: data.changePercent,
              data: data.historicalData,
              meta: data.meta,
              loading: false
            };

            if (displayTicker && displayTicker.symbol === sparklines[index].symbol && activeRange === "1D") {
              displayTicker = toDetailTicker(data, sparklines[index].name);
            }
          } else {
            console.error("Failed to fetch", sparklines[index].symbol, result.reason);
            sparklines[index] = {
              ...sparklines[index],
              loading: false
            };
          }
        });

        sparklines = [...sparklines];
      });

    fetch("https://decapi.me/twitch/uptime/hasanabi")
      .then(res => res.text())
      .then(text => {
        streamIsLive = !text.toLowerCase().includes("offline");
        checkingStream = false;
      })
      .catch(() => {
        streamIsLive = false;
        checkingStream = false;
      });

    // Fetch the stored YouTube videos from local SQLite DB
    fetch(`${baseUrl}/api/feed/youtube`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          youtubeVideos = data;
        }
      })
      .catch(err => console.error("Failed to fetch YouTube feed", err));
  });
</script>

<div class="flex flex-row justify-center w-full max-w-[1600px] mx-auto text-white relative">

  <!-- LEFT DASHBOARD AREA -->
  <div class="w-[calc(100%-21rem)] 2xl:w-[calc(100%-27rem)] shrink-0 flex flex-col gap-4 overflow-hidden">

    <!-- TOP ROW: 7 SPARKLINES -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {#each sparklines as sl}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          on:click={() => toggleTicker(sl)}
          class="cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-white/5 rounded-xl {selectedTicker?.symbol === sl.symbol ? 'ring-1 ring-[#38bdf8]/50' : ''}"
        >
          <SparklineCard
            name={sl.name}
            price={sl.price}
            changeAmount={sl.changeAmount}
            changePercent={sl.changePercent}
            historicalData={sl.data}
          />
        </div>
      {/each}
    </div>

    <!-- MAIN LEFT COLUMN STACK: Ticker Detail -> Expanded Grid -> Twitch Stream -->
    <div class="flex flex-col gap-4">
      <!-- 1. INLINE TICKER DETAIL (Pushes content down) -->
      {#if selectedTicker}
        <div class="bg-[#111118] border border-white/5 rounded-xl overflow-hidden flex flex-col" transition:slide={{ duration: 250 }}>
          <div class="p-5 md:p-6 flex flex-col gap-5">

            <!-- Header -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 font-bold border border-white/10 text-lg shrink-0">
                  {displayTicker?.name?.charAt(0) ?? ""}
                </div>
                <div class="flex flex-col">
                  <h2 class="text-xl font-bold text-white tracking-wide">{displayTicker?.name ?? ""}</h2>
                  <span class="text-[11px] font-mono text-slate-400 mt-0.5">{displayTicker?.symbol ?? ""}</span>
                </div>
              </div>
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <button on:click={() => { detailRequestToken += 1; compareRequestToken += 1; selectedTicker = null; resetExpandedTickerState(); }} class="text-slate-400 hover:text-white p-2 text-lg hover:bg-white/5 rounded-full transition-colors w-9 h-9 flex items-center justify-center shrink-0">✕</button>
            </div>

            <div class="bg-[#1a1a24] rounded-xl border border-white/5 p-5 flex flex-col gap-5">

              <!-- Price -->
              <div class="flex flex-col gap-1">
                <div class="flex items-baseline gap-3">
                  <span class="text-2xl font-bold text-white">${(displayTicker?.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span class="text-base font-medium {(displayTicker?.changeAmount ?? 0) >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}">
                    {(displayTicker?.changeAmount ?? 0) >= 0 ? "+" : ""}${(displayTicker?.changeAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span class="ml-1">{(displayTicker?.changeAmount ?? 0) >= 0 ? "↗" : "↘"} {Math.abs(displayTicker?.changePercent ?? 0).toFixed(2)}%</span>
                  </span>
                </div>
                <span class="text-[11px] text-slate-400 font-mono mt-1">{detailCaption}</span>
              </div>

              <!-- Timeframes -->
              <div class="flex flex-wrap gap-4 items-center justify-between border-b border-white/5 pb-4">
                <div class="flex items-center bg-white/5 border border-white/5 rounded-lg p-1 text-xs font-semibold text-slate-400">
                  {#each TIMEFRAME_OPTIONS as range}
                    <button
                      on:click={() => handleRangeChange(range)}
                      class="px-3 py-1.5 rounded-md transition-colors {activeRange === range ? 'bg-[#2a2a35] text-white shadow-sm' : 'hover:text-white'}"
                      disabled={detailLoading && activeRange === range}
                    >
                      {range}
                    </button>
                  {/each}
                </div>
                <button
                  on:click={toggleCompareOverlay}
                  class="bg-white/5 border border-white/5 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1 {compareEnabled ? 'border-[#38bdf8]/30 text-white bg-[#38bdf8]/10' : ''}"
                  disabled={detailLoading || compareLoading}
                >
                  {compareButtonLabel}
                </button>
              </div>

              <!-- SVG Chart -->
              <div class="h-48 border border-white/5 bg-gradient-to-b from-[#111118] to-transparent rounded-lg relative flex flex-col overflow-hidden">
                {#if chartLines.length > 0 && chartLines[0].data.length > 0}
                  <div class="absolute left-0 right-0 border-t border-dashed border-white/20 z-0" style={`top: ${baselineTop}%;`}></div>
                  <div class="absolute right-4 -translate-y-1/2 bg-black/80 text-white/50 text-[10px] px-2 py-0.5 rounded-full border border-white/10 z-10 font-mono shadow-md" style={`top: ${baselineTop}%;`}>
                    {baselineLabel}
                  </div>
                {/if}
                {#if detailLoading}
                  <div class="absolute inset-0 z-20 bg-[#111118]/70 backdrop-blur-[1px] flex items-center justify-center text-[11px] text-slate-300 font-mono tracking-wide">
                    Loading {activeRange}...
                  </div>
                {/if}
                <div class="flex-1 flex items-end z-10 overflow-hidden opacity-80">
                  {#if chartLines.length > 0 && chartLines[0].data.length > 0}
                    <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1000 250">
                      {#each chartLines as line}
                        {#if line.fill}
                          <path
                            d={getSvgPath(line.data, chartBounds.min, chartBounds.max, true)}
                            fill={primaryAreaFill}
                          />
                        {/if}
                      {/each}
                      {#each chartLines as line}
                        <path
                          d={getSvgPath(line.data, chartBounds.min, chartBounds.max, false)}
                          fill="none"
                          stroke={line.color}
                          stroke-width={line.key === displayTicker?.symbol ? 2.4 : 2}
                          stroke-linecap="round"
                        />
                      {/each}
                    </svg>
                  {:else if detailError}
                    <div class="flex h-full w-full items-center justify-center text-xs text-slate-500 font-mono px-4 text-center">
                      {detailError}
                    </div>
                  {/if}
                </div>
              </div>

              {#if compareEnabled && chartLines.length > 1}
                <div class="flex flex-wrap gap-2 -mt-2">
                  {#each chartLines as line}
                    <div class="inline-flex items-center gap-2 bg-white/5 border border-white/5 rounded-full px-3 py-1 text-[11px] text-slate-300">
                      <span class="w-2 h-2 rounded-full shrink-0" style={`background-color: ${line.color};`}></span>
                      <span>{line.name}</span>
                      <span class={line.changePercent >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}>
                        {line.changePercent >= 0 ? '+' : ''}{line.changePercent.toFixed(2)}%
                      </span>
                    </div>
                  {/each}
                </div>
              {/if}

              <!-- Metrics Grid -->
              <div class="grid grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 text-[13px] pt-4 border-t border-white/5">
                <div class="flex flex-col gap-3">
                  <div class="flex justify-between border-b border-white/5 pb-2"><span class="text-slate-400">Prev Close</span><span class="font-medium text-white font-mono">${(displayTicker?.meta?.prevClose ?? (displayTicker?.price ?? 0) - (displayTicker?.changeAmount ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  <div class="flex justify-between border-b border-white/5 pb-2"><span class="text-slate-400">Open</span><span class="font-medium text-white font-mono">${(displayTicker?.meta?.open ?? displayTicker?.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  <div class="flex justify-between pb-2"><span class="text-slate-400">Year Low</span><span class="font-medium text-white font-mono">${(displayTicker?.meta?.yearLow ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                </div>
                <div class="flex flex-col gap-3">
                  <div class="flex justify-between border-b border-white/5 pb-2"><span class="text-slate-400">Volume</span><span class="font-medium text-white font-mono">{formatVolume(displayTicker?.meta?.volume)}</span></div>
                  <div class="flex justify-between border-b border-white/5 pb-2"><span class="text-slate-400">{lowMetricLabel}</span><span class="font-medium text-white font-mono">${(displayTicker?.meta?.low ?? displayTicker?.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  <div class="flex justify-between pb-2"></div>
                </div>
                <div class="flex-col gap-3 hidden lg:flex">
                  <div class="flex justify-between border-b border-white/5 pb-2"><span class="text-slate-400">{highMetricLabel}</span><span class="font-medium text-white font-mono">${(displayTicker?.meta?.high ?? displayTicker?.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  <div class="flex justify-between border-b border-white/5 pb-2"><span class="text-slate-400">Year High</span><span class="font-medium text-white font-mono">${(displayTicker?.meta?.yearHigh ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  <div class="flex justify-between pb-2"></div>
                </div>
              </div>

            </div>
          </div>
        </div>
      {/if}

      <!-- 2. EXPANDED VIDEO FEED GRID -->
      {#if showExpandedFeed}
        <div class="bg-[#111118] border border-white/5 rounded-xl overflow-hidden flex flex-col p-5" transition:slide={{ duration: 300 }}>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-white tracking-wide">Subscription Feed</h2>
            <button on:click={() => showExpandedFeed = false} class="text-slate-400 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5">✕</button>
          </div>
          
          {#if youtubeVideos.length === 0}
            <div class="text-sm text-slate-500 font-mono text-center my-20">No videos tracked yet.</div>
          {:else}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {#each youtubeVideos as video}
                <div class="flex flex-col gap-2 group relative">
                  <!-- Thumbnail Container -->
                  <div class="w-full aspect-video bg-white/5 rounded-xl border border-white/10 relative overflow-hidden group-hover:border-white/20 transition-colors">
                    <a href={video.url} target="_blank" class="block w-full h-full relative cursor-pointer">
                      <img src={video.thumbnail} alt={video.title} class="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      <!-- Saved Badge -->
                      {#if video.isSaved}
                        <div class="absolute bottom-2 right-2 bg-[#38bdf8] text-white p-1 rounded-md shadow-lg pointer-events-none">
                          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm11 1H6v8l4-2 4 2V6z" clip-rule="evenodd"></path></svg>
                        </div>
                      {/if}
                    </a>
                    
                    <!-- Action Overlay Buttons (Top Right) -->
                    <div class="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 translate-x-2 group-hover:translate-x-0">
                      <!-- Hide / Remove -->
                      <button 
                        on:click|preventDefault={() => handleVideoAction(video.videoId, 'hide')}
                        class="bg-black/70 hover:bg-black/90 text-white w-7 h-7 rounded-sm flex items-center justify-center backdrop-blur-md transition-all shadow-xl border border-white/10"
                        title="Remove from feed"
                      >
                       <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </button>
                      <!-- Watch Later -->
                      <button 
                        on:click|preventDefault={() => handleVideoAction(video.videoId, 'save')}
                        class="bg-black/70 hover:bg-[#38bdf8]/90 text-white w-7 h-7 rounded-sm flex items-center justify-center backdrop-blur-md transition-all shadow-xl border border-white/10"
                        title="Watch later"
                      >
                       <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"></path></svg>
                      </button>
                    </div>
                  </div>
                  <!-- Text Details -->
                  <div class="flex flex-col px-1">
                    <h3 class="text-sm font-semibold leading-snug text-slate-100 group-hover:text-white line-clamp-2 mt-1">{video.title}</h3>
                    <div class="flex items-center justify-between mt-1">
                      <span class="text-[12px] text-slate-400 truncate">{video.channelName}</span>
                      <span class="text-[10px] text-slate-500 font-mono shrink-0 whitespace-nowrap pl-2">
                        {new Date(video.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- 3. TWITCH STREAM (Always bottom, pushed down safely) -->
      <div class="bg-[#111118] border border-white/5 rounded-xl overflow-hidden flex flex-col">
        <div class="flex items-center justify-between p-3 border-b border-white/5 bg-[#1a1a24] select-none">
          <div class="flex items-center gap-3">
            <span class="text-sm font-semibold tracking-wider text-slate-300 uppercase">Stream · HasanAbi</span>
            {#if streamIsLive && !checkingStream}
              <span class="flex items-center gap-1.5 text-xs text-[#4ade80] font-mono">
                <span class="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse"></span> LIVE
              </span>
            {/if}
          </div>
        </div>
        
        <div class="w-full aspect-video bg-black overflow-hidden relative flex items-center justify-center">
          {#if checkingStream}
            <div class="text-white/40 font-mono text-xs tracking-widest uppercase animate-pulse">Checking connection...</div>
          {:else if streamIsLive}
            <iframe
              title="HasanAbi Twitch Stream"
              src="https://player.twitch.tv/?channel=hasanabi&parent=philippeho.popnux.com&parent=localhost"
              height="100%" width="100%" allowfullscreen
              class="w-full h-full border-0 absolute inset-0"
            ></iframe>
          {:else}
            <div class="flex flex-col items-center justify-center gap-4 text-white/30 p-8 text-center border border-white/5 rounded-xl bg-white/[0.02]">
              <svg class="w-12 h-12 opacity-50 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <div class="flex flex-col gap-1">
                <span class="font-bold text-sm tracking-widest uppercase text-white/50">Stream Offline</span>
                <span class="text-xs font-mono opacity-80">Waiting for broadcast to resume</span>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- RIGHT COLUMN: FEEDS SIDEBAR (slides away to smoothly recenter the main feed without lag) -->
  {#if !showExpandedFeed}
  <div class="ml-4 bg-[#111118] border border-white/5 rounded-xl overflow-hidden flex flex-col w-[20rem] 2xl:w-[26rem] shrink-0" transition:slide={{ axis: 'x', duration: 350 }}>
    
    <!-- Top Row: Expanded View Toggle + Tabs Row -->
    <div class="flex flex-row items-stretch border-b border-white/5 bg-[#1a1a24]">
      <!-- Expanded View Toggle (Slim, only in header) -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div 
        on:click={() => { showExpandedFeed = !showExpandedFeed; selectedTicker = null; }}
        class="w-5 shrink-0 flex items-center justify-center cursor-pointer hover:bg-[#38bdf8]/10 transition-colors group border-r border-white/5 bg-black/20"
        title="Toggle Expanded Grid"
      >
        {#if showExpandedFeed}
          <svg class="w-3 h-3 text-slate-600 group-hover:text-[#38bdf8] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" /></svg>
        {:else}
          <svg class="w-3 h-3 text-slate-600 group-hover:text-[#38bdf8] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" /></svg>
        {/if}
      </div>

      <!-- Tab Row: 4 Clickable Categories with Badges -->
      <div class="grid grid-cols-4 p-3 gap-2 select-none flex-1">
      
      <!-- YouTube Tab -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div 
        on:click={() => activeFeedCategory = 'youtube'} 
        class="relative flex flex-col items-center justify-center p-2 rounded-lg cursor-pointer transition-all {activeFeedCategory === 'youtube' ? 'bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/20' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-transparent'}"
      >
        {#if youtubeVideos.length > 0}
          <span class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-[#1a1a24] z-10">
            {youtubeVideos.length === 50 ? '50+' : youtubeVideos.length}
          </span>
        {/if}
        <svg class="w-5 h-5 mb-1" viewBox="0 0 24 24" fill="currentColor"><path d="M21.582,6.186c-0.23-0.86-0.908-1.538-1.768-1.768C18.254,4,12,4,12,4S5.746,4,4.186,4.418c-0.86,0.23-1.538,0.908-1.768,1.768C2,7.746,2,12,2,12s0,4.254,0.418,5.814c0.23,0.86,0.908,1.538,1.768,1.768C5.746,20,12,20,12,20s6.254,0,7.814-0.418c0.86-0.23,1.538-0.908,1.768-1.768C22,16.254,22,12,22,12S22,7.746,21.582,6.186z M10,15.464V8.536L16,12L10,15.464z"/></svg>
        <span class="text-[10px] font-bold uppercase tracking-wider hidden sm:block">Video</span>
      </div>

      <!-- News Tab -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div 
        on:click={() => activeFeedCategory = 'news'} 
        class="relative flex flex-col items-center justify-center p-2 rounded-lg cursor-pointer transition-all {activeFeedCategory === 'news' ? 'bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/20' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-transparent'}"
      >
        <svg class="w-5 h-5 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
        <span class="text-[10px] font-bold uppercase tracking-wider hidden sm:block">News</span>
      </div>

      <!-- Social Tab -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div 
        on:click={() => activeFeedCategory = 'social'} 
        class="relative flex flex-col items-center justify-center p-2 rounded-lg cursor-pointer transition-all {activeFeedCategory === 'social' ? 'bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/20' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-transparent'}"
      >
        <svg class="w-5 h-5 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>
        <span class="text-[10px] font-bold uppercase tracking-wider hidden sm:block">Social</span>
      </div>

      <!-- Alerts Tab -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div 
        on:click={() => activeFeedCategory = 'alerts'} 
        class="relative flex flex-col items-center justify-center p-2 rounded-lg cursor-pointer transition-all {activeFeedCategory === 'alerts' ? 'bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/20' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-transparent'}"
      >
        <svg class="w-5 h-5 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
        <span class="text-[10px] font-bold uppercase tracking-wider hidden sm:block">Alerts</span>
      </div>

    </div>
    </div>
    
    <!-- List Content Area -->
    <div class="p-4 flex-1 overflow-y-auto w-full relative">
      {#if activeFeedCategory === 'youtube'}
        <div class="space-y-4">
          <!-- Live YouTube Videos -->
          {#if youtubeVideos.length === 0}
            <div class="text-xs text-slate-500 font-mono text-center mt-10">No videos yet. Send webhook to /BrainrotDashboard/api/webhook/youtube</div>
          {/if}
          {#each youtubeVideos as video}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="flex gap-3 group cursor-pointer transition-all duration-200 hover:bg-[#38bdf8]/5 hover:border-[#38bdf8]/10 p-2 -mx-2 rounded-xl relative border border-transparent">
              <!-- Read Marker if Saved -->
              {#if video.isSaved}
                <div class="absolute -left-1.5 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#38bdf8] rounded-r-full"></div>
              {/if}
              <!-- 16:9 Thumbnail -->
              <a href={video.url} target="_blank" class="w-28 sm:w-36 aspect-video bg-white/5 rounded-lg flex-shrink-0 border border-white/10 relative overflow-hidden block">
                <img src={video.thumbnail} alt={video.title} class="absolute inset-0 w-full h-full object-cover" />
                <!-- Play Icon Overlay -->
                <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                  <svg class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </a>
              
              <!-- Text Info -->
              <div class="flex flex-col gap-1 flex-1 py-0.5 min-w-0">
                <a href={video.url} target="_blank" class="text-sm font-semibold leading-tight text-white group-hover:text-[#38bdf8] transition-colors line-clamp-2">{video.title}</a>
                <span class="text-[11px] text-slate-400 mt-1">{video.channelName}</span>
                <div class="flex items-center justify-between mt-auto">
                  <span class="text-[10px] text-slate-500 font-mono">
                     {new Date(video.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <!-- Action Buttons -->
                  <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    <button 
                      on:click|preventDefault|stopPropagation={() => handleVideoAction(video.videoId, 'save')}
                      class="w-6 h-6 rounded flex items-center justify-center transition-all duration-150 hover:scale-110 active:scale-95 {video.isSaved ? 'bg-[#38bdf8]/20 text-[#38bdf8]' : 'bg-white/5 text-slate-500 hover:bg-[#38bdf8]/20 hover:text-[#38bdf8]'}"
                      title="Watch later"
                    >
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                    </button>
                    <button 
                      on:click|preventDefault|stopPropagation={() => handleVideoAction(video.videoId, 'hide')}
                      class="w-6 h-6 rounded flex items-center justify-center bg-white/5 text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition-all duration-150 hover:scale-110 active:scale-95"
                      title="Remove from feed"
                    >
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <!-- Prototype generic skeleton for other tabs -->
        <div class="space-y-4 opacity-50">
          {#each [1, 2, 3, 4, 5, 6, 7] as _}
            <div class="flex gap-3 items-center">
              <div class="w-10 h-10 bg-white/5 rounded-lg flex-shrink-0 border border-white/10"></div>
              <div class="flex flex-col gap-2 flex-1">
                <div class="h-2.5 bg-white/10 rounded w-full"></div>
                <div class="h-2 bg-white/5 rounded w-2/3"></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
  {/if}

</div>
