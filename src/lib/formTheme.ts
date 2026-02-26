export interface WelcomeScreen {
  enabled: boolean;
  title?: string;
  description?: string;
  button_text?: string;
  image_url?: string;
  image_size?: "cover" | "contain" | "repeat";
  image_overlay?: number;
  logo_url?: string;
  video_url?: string;
}

export interface FormTheme {
  background_color: string;
  text_color: string;
  text_secondary_color: string;
  button_color: string;
  button_text_color: string;
  font_family: string;
  font_size?: number; // px, default 16
  font_weight?: "normal" | "bold";
  font_style?: "normal" | "italic";
  background_image?: string;
  background_size?: "cover" | "contain" | "repeat";
  background_overlay?: number;
  welcome_screen?: WelcomeScreen;
}

export const DEFAULT_THEME: FormTheme = {
  background_color: "#FFFFFF",
  text_color: "#1A1A1A",
  text_secondary_color: "#6B7280",
  button_color: "#7C3AED",
  button_text_color: "#FFFFFF",
  font_family: "Inter",
};

export interface ThemePalette {
  name: string;
  theme: FormTheme;
}

export const THEME_PALETTES: ThemePalette[] = [
  {
    name: "Clássico",
    theme: {
      background_color: "#FFFFFF",
      text_color: "#1A1A1A",
      text_secondary_color: "#6B7280",
      button_color: "#7C3AED",
      button_text_color: "#FFFFFF",
      font_family: "Inter",
    },
  },
  {
    name: "Oceano",
    theme: {
      background_color: "#0F172A",
      text_color: "#E2E8F0",
      text_secondary_color: "#94A3B8",
      button_color: "#0EA5E9",
      button_text_color: "#FFFFFF",
      font_family: "Space Grotesk",
    },
  },
  {
    name: "Floresta",
    theme: {
      background_color: "#F0FDF4",
      text_color: "#14532D",
      text_secondary_color: "#166534",
      button_color: "#16A34A",
      button_text_color: "#FFFFFF",
      font_family: "Lora",
    },
  },
  {
    name: "Sunset",
    theme: {
      background_color: "#FFF7ED",
      text_color: "#7C2D12",
      text_secondary_color: "#9A3412",
      button_color: "#EA580C",
      button_text_color: "#FFFFFF",
      font_family: "Poppins",
    },
  },
  {
    name: "Noturno",
    theme: {
      background_color: "#18181B",
      text_color: "#FAFAFA",
      text_secondary_color: "#A1A1AA",
      button_color: "#A78BFA",
      button_text_color: "#FFFFFF",
      font_family: "Space Grotesk",
    },
  },
  {
    name: "Coral",
    theme: {
      background_color: "#FFF1F2",
      text_color: "#881337",
      text_secondary_color: "#9F1239",
      button_color: "#E11D48",
      button_text_color: "#FFFFFF",
      font_family: "Playfair Display",
    },
  },
  {
    name: "Minimalista",
    theme: {
      background_color: "#FAFAFA",
      text_color: "#3F3F46",
      text_secondary_color: "#71717A",
      button_color: "#18181B",
      button_text_color: "#FFFFFF",
      font_family: "Inter",
    },
  },
  {
    name: "Gradiente",
    theme: {
      background_color: "linear-gradient(135deg, #7C3AED, #EC4899)",
      text_color: "#FFFFFF",
      text_secondary_color: "rgba(255,255,255,0.7)",
      button_color: "#FFFFFF",
      button_text_color: "#7C3AED",
      font_family: "Poppins",
    },
  },
];

export const AVAILABLE_FONTS = [
  "Inter",
  "Space Grotesk",
  "Poppins",
  "Roboto",
  "Lora",
  "Playfair Display",
];

export function getThemeStyle(theme: FormTheme): React.CSSProperties {
  const isGradient = theme.background_color.includes("gradient");
  const vars: Record<string, string> = {
    "--runner-bg": theme.background_color,
    "--runner-text": theme.text_color,
    "--runner-text-secondary": theme.text_secondary_color,
    "--runner-btn-bg": theme.button_color,
    "--runner-btn-text": theme.button_text_color,
  };
  const style: React.CSSProperties = {
    fontFamily: `"${theme.font_family}", sans-serif`,
    fontSize: theme.font_size ? `${theme.font_size}px` : undefined,
    fontWeight: theme.font_weight || undefined,
    fontStyle: theme.font_style || undefined,
    ...(isGradient
      ? { background: theme.background_color }
      : { backgroundColor: theme.background_color }),
    color: theme.text_color,
    ...(theme.background_image
      ? {
          backgroundImage: `url(${theme.background_image})`,
          backgroundSize:
            theme.background_size === "repeat" ? "auto" : (theme.background_size || "cover"),
          backgroundRepeat:
            theme.background_size === "repeat" ? "repeat" : "no-repeat",
          backgroundPosition: "center",
        }
      : {}),
  };
  return { ...vars, ...style } as React.CSSProperties;
}

export function loadGoogleFont(fontFamily: string) {
  const id = `gfont-${fontFamily.replace(/\s/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}
