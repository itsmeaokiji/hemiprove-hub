import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Geist", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Geist Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        carbon: {
          950: "#0B0B0A",
          900: "#111110",
          800: "#181816",
          700: "#232320",
        },
        ink: {
          primary: "#EDEDEC",
          secondary: "#9A9A94",
          muted: "#63635E",
        },
        hemi: {
          DEFAULT: "#FF5500",
          hover: "#E04800",
        },
        border: "#232320",
        input: "#232320",
        ring: "#FF5500",
        background: "#0B0B0A",
        foreground: "#EDEDEC",
        primary: {
          DEFAULT: "#FF5500",
          foreground: "#0B0B0A",
        },
        secondary: {
          DEFAULT: "#181816",
          foreground: "#EDEDEC",
        },
        destructive: {
          DEFAULT: "#F43F5E",
          foreground: "#EDEDEC",
        },
        muted: {
          DEFAULT: "#111110",
          foreground: "#63635E",
        },
        accent: {
          DEFAULT: "#FF5500",
          foreground: "#0B0B0A",
        },
        popover: {
          DEFAULT: "#111110",
          foreground: "#EDEDEC",
        },
        card: {
          DEFAULT: "#111110",
          foreground: "#EDEDEC",
        },
      },
      borderRadius: {
        lg: "2px",
        md: "2px",
        sm: "2px",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
