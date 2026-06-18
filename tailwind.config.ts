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
        bg: "var(--bg)",
        surface: "var(--surface)",
        text: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
        },
        accent: "var(--accent)",
        navy: "var(--navy)",
        "blue-tint": "var(--blue-tint)",
        "baby-blue": "var(--baby-blue)",
        "light-blue": "var(--light-blue)",
        "steel-blue": "var(--steel-blue)",
        divider: "var(--divider)",
        stroke: "var(--stroke)",
        ring: "var(--ring)",
      },
      fontFamily: {
        sans: ["var(--font-rethink)", "system-ui", "sans-serif"],
        serif: ["var(--font-hedvig)", "Georgia", "serif"],
        display: ["var(--font-hedvig)", "Georgia", "serif"],
      },
      fontSize: {
        display: ["56px", { lineHeight: "1.05", fontWeight: "400" }],
        h1: ["36px", { lineHeight: "1.1", fontWeight: "400" }],
        h2: ["24px", { lineHeight: "1.2", fontWeight: "600" }],
        h3: ["18px", { lineHeight: "1.3", fontWeight: "600" }],
        body: ["15px", { lineHeight: "1.5", fontWeight: "400" }],
        caption: ["13px", { lineHeight: "1.4", fontWeight: "500", letterSpacing: "0.02em" }],
        stat: ["40px", { lineHeight: "1.05", fontWeight: "400" }],
      },
      borderRadius: {
        card: "10px",
        btn: "8px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(20, 36, 46, 0.04)",
      },
      maxWidth: {
        content: "1200px",
      },
      spacing: {
        section: "56px",
      },
    },
  },
  plugins: [],
};
export default config;
