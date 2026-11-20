/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0B",
        panel: "#111113",
        panel2: "#141417",
        hair: "#1E1E22",
        mutefg: "#8A8A93",
        dimfg: "#B4B4BB",
        fg: "#EDEDEF",
        red: "#FF453A",
        green: "#30D158",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
