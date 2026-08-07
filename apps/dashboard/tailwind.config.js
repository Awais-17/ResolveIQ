/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#eef4ff", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8" },
        ok: { 500: "#22c55e", 700: "#15803d" },
        warn: { 500: "#f59e0b", 700: "#b45309" },
        crit: { 500: "#ef4444", 700: "#b91c1c" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
