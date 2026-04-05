import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1B3A5C",
          dark: "#0F2740",
          light: "#2A5A8C",
        },
        accent: "#C8A415",
        "bg-light": "#F5F7FA",
        "bg-dark": "#1A1A2E",
        "text-dark": "#1F2937",
        "text-muted": "#6B7280",
        border: "#E5E7EB",
        success: "#059669",
        error: "#DC2626",
        warning: "#D97706",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
