/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        lcd: ["VT323", "monospace"],
      },
      colors: {
        // South African flag green, used sparingly as the single accent
        accent: { DEFAULT: "#00a86b", strong: "#007a4d", soft: "#00a86b1f" },
        gold: { DEFAULT: "#ffb612" },
      },
    },
  },
  plugins: [],
};
