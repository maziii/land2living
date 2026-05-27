import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          50: "#f0f7f0",
          100: "#dceddc",
          200: "#bcdabc",
          300: "#8fbf8f",
          400: "#5f9e5f",
          500: "#3d7d3d",
          600: "#2e632e",
          700: "#264f26",
          800: "#1f3f1f",
          900: "#183318",
        },
        terracotta: {
          50: "#fdf4f0",
          100: "#fae5da",
          200: "#f5c9b3",
          300: "#eda484",
          400: "#e27a55",
          500: "#d4522e",
          600: "#b83e22",
          700: "#98311c",
          800: "#7c281a",
          900: "#662218",
        },
      },
    },
  },
  plugins: [],
};

export default config;
