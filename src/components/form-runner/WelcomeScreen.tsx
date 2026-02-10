import { motion } from "framer-motion";
import type { FormTheme, WelcomeScreen as WelcomeScreenType } from "@/lib/formTheme";
import { getThemeStyle } from "@/lib/formTheme";
import logoPratique from "@/assets/logo-pratique.png";

interface WelcomeScreenProps {
  formName: string;
  theme: FormTheme;
  welcome: WelcomeScreenType;
  onStart: () => void;
}

export const WelcomeScreen = ({ formName, theme, welcome, onStart }: WelcomeScreenProps) => {
  const themeStyle = getThemeStyle(theme);
  const hasImage = !!welcome.image_url;
  const hasOverlay = hasImage && (welcome.image_overlay ?? 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center p-6 relative"
      style={{
        ...themeStyle,
        ...(hasImage
          ? {
              backgroundImage: `url(${welcome.image_url})`,
              backgroundSize:
                welcome.image_size === "repeat" ? "auto" : (welcome.image_size || "cover"),
              backgroundRepeat: welcome.image_size === "repeat" ? "repeat" : "no-repeat",
              backgroundPosition: "center",
            }
          : {}),
      }}
    >
      {hasOverlay && (
        <div
          className="absolute inset-0 z-0"
          style={{ backgroundColor: `rgba(0,0,0,${welcome.image_overlay})` }}
        />
      )}
      {/* Also show theme bg overlay if applicable */}
      {theme.background_image && theme.background_overlay && theme.background_overlay > 0 && !hasImage && (
        <div
          className="absolute inset-0 z-0"
          style={{ backgroundColor: `rgba(0,0,0,${theme.background_overlay})` }}
        />
      )}

      <div className="relative z-10 text-center max-w-lg space-y-6">
        {welcome.logo_url && (
          <motion.img
            src={welcome.logo_url}
            alt=""
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="max-h-40 max-w-xs object-contain rounded-lg mx-auto"
          />
        )}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-3xl md:text-4xl font-bold"
          style={{ color: theme.text_color }}
        >
          {welcome.title || formName}
        </motion.h1>

        {welcome.description && (
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-lg"
            style={{ color: theme.text_secondary_color }}
          >
            {welcome.description}
          </motion.p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <button
            onClick={onStart}
            className="px-8 py-3 rounded-lg text-lg font-semibold transition-transform hover:scale-105 active:scale-95"
            style={{
              backgroundColor: theme.button_color,
              color: theme.button_text_color,
            }}
          >
            {welcome.button_text || "Começar"}
          </button>
        </motion.div>
      </div>

      <footer className="absolute bottom-4 left-0 right-0 text-center z-10">
        <div className="flex items-center justify-center gap-1 text-xs" style={{ color: theme.text_secondary_color }}>
          <img src={logoPratique} alt="TecForms" className="h-4 w-4 rounded-full" />
          <span>TecForms</span>
        </div>
      </footer>
    </motion.div>
  );
};
