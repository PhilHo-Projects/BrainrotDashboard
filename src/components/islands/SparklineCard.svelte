<script lang="ts">
  import { onMount } from "svelte";
  import { Chart, LineController, LineElement, PointElement,
           LinearScale, CategoryScale, Tooltip, Filler } from "chart.js";

  Chart.register(LineController, LineElement, PointElement,
                 LinearScale, CategoryScale, Tooltip, Filler);

  export let name: string = "S&P 500";
  export let price: number = 6869.50;
  export let changeAmount: number = 54.25;
  export let changePercent: number = 0.79;
  
  // Expects array of numbers [oldest, ..., newest]
  export let historicalData: number[] = [];

  let canvas: HTMLCanvasElement;
  let chart: Chart;

  onMount(() => {
    // Determine color based on whether today is up or down vs yesterday
    const isUp = changeAmount >= 0;
    const baseColor = isUp ? "rgba(74, 222, 128, 1)" : "rgba(248, 113, 113, 1)"; // Tailwind green-400 or red-400
    
    // Create subtle gradient for area under curve
    const ctx = canvas.getContext("2d");
    const gradient = ctx?.createLinearGradient(0, 0, 0, canvas.height);
    if (gradient) {
        gradient.addColorStop(0, isUp ? "rgba(74, 222, 128, 0.2)" : "rgba(248, 113, 113, 0.2)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)"); // Fade to transparent
    }

    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: historicalData.map((_, i) => String(i)), // Dummy labels since x-axis is hidden
        datasets: [{
          data: [...historicalData], // Spread to create a shallow copy to prevent Svelte 5 Proxy mutation errors
          borderColor: baseColor,
          backgroundColor: gradient || "transparent",
          borderWidth: 2,
          tension: 0.2,    // Slight smoothing, but mostly jagged like stock charts
          pointRadius: 0,  // Hide dots on the line
          pointHoverRadius: 0,
          fill: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
            padding: 0
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }, // Sparklines usually don't have tooltips
        },
        scales: {
          x: { 
            display: false, // Hide entirely
          },
          y: { 
            display: false, // Hide entirely
            // Add a tiny bit of padding to min/max so line doesn't clip top/bottom
            min: historicalData.length > 0 ? Math.min(...historicalData) * 0.999 : 0,
            max: historicalData.length > 0 ? Math.max(...historicalData) * 1.001 : 1,
          },
        },
      },
    });
  });

  // Reactive statement to dynamically update Chart.js when Astro API responds
  $: if (chart && historicalData.length > 0) {
    const isUp = changeAmount >= 0;
    const baseColor = isUp ? "rgba(74, 222, 128, 1)" : "rgba(248, 113, 113, 1)";
    
    chart.data.labels = historicalData.map((_, i) => String(i));
    chart.data.datasets[0].data = [...historicalData];
    chart.data.datasets[0].borderColor = baseColor;
    
    const ctx = canvas?.getContext("2d");
    if (ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, isUp ? "rgba(74, 222, 128, 0.2)" : "rgba(248, 113, 113, 0.2)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        chart.data.datasets[0].backgroundColor = gradient;
    }
    
    if (chart.options.scales?.y) {
        chart.options.scales.y.min = Math.min(...historicalData) * 0.999;
        chart.options.scales.y.max = Math.max(...historicalData) * 1.001;
    }

    chart.update();
  }
</script>

<div class="flex flex-col bg-[#111118] border border-white/5 rounded-xl p-3 overflow-hidden h-[100px] transition-colors hover:border-white/10 cursor-pointer relative group">
    <!-- Header: Name -->
    <span class="text-xs font-semibold text-slate-300 mb-0.5">{name}</span>
    
    <!-- Price & Change -->
    <div class="flex flex-col gap-0.5 z-10 relative">
        {#if historicalData.length === 0}
            <span class="text-xs font-mono text-slate-400 animate-pulse mt-1">Loading API...</span>
        {:else}
            <span class="text-base font-mono font-semibold tracking-tight text-white leading-none">${price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            <span class="text-[11px] font-mono leading-none {changeAmount >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}">
                {changeAmount >= 0 ? '↗' : '↘'} {Math.abs(changePercent).toFixed(2)}%
            </span>
        {/if}
    </div>

    <!-- Chart pushes to bottom, positioned absolute to fill space under text or relative with negative margin -->
    <div class="absolute bottom-0 left-0 right-0 h-[45px] opacity-80 group-hover:opacity-100 transition-opacity" style="visibility: {historicalData.length === 0 ? 'hidden' : 'visible'}">
        <!-- Optional: Dotted previous close line -->
        <!-- <div class="absolute top-1/2 left-0 right-0 border-t border-dashed border-white/10 z-0"></div> -->
        <canvas bind:this={canvas} class="z-10"></canvas>
    </div>
</div>
