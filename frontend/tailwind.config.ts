import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#080D10",
        surface: "#0D1418",
        card: "#111A1F",
        elevated: "#152027",
        primary: "#32E875",
        "primary-hover": "#28CB65",
        foreground: "#F7F9FA",
        secondary: "#93A1AA",
        muted: "#65747D",
        warning: "#F5B942",
        danger: "#FF5252",
        info: "#38A9FF",
        purple: "#9565F6"
      },
      boxShadow: {
        panel: "0 14px 32px rgba(0,0,0,.24)",
        green: "0 10px 30px rgba(50,232,117,.12)"
      },
      borderRadius: {
        panel: "14px"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateX(-12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        }
      },
      animation: {
        "fade-up": "fade-up .28s ease-out both",
        "slide-in": "slide-in .22s ease-out both"
      }
    }
  },
  plugins: []
};

export default config;
