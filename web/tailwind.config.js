/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14110B",
        panel: "#1B1710",
        panel2: "#221C12",
        hair: "#2C2518",
        mutefg: "#9A9284",
        dimfg: "#C6BEAF",
        fg: "#F3EFE7",
        saffron: "#B45309",
        saffron2: "#E0932F",
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
