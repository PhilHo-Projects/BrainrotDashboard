export default {
    content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,svelte}"],
    theme: {
        extend: {
            colors: {
                base: "#0a0a0f",
                panel: "#111118",
                border: "rgba(255,255,255,0.08)",
                accent: "#38bdf8",
                up: "#4ade80",
                down: "#f87171",
                muted: "#64748b",
            },
            fontFamily: {
                mono: ["JetBrains Mono", "monospace"],
                sans: ["Inter", "sans-serif"],
            },
        },
    },
};
