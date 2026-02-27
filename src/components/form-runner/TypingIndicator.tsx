import { motion } from "framer-motion";

export const TypingIndicator = () => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.2 }}
      className="w-full max-w-xl mx-auto flex justify-start"
    >
      <div
        className="relative inline-flex items-center gap-1.5 px-5 py-3.5 rounded-2xl rounded-bl-sm overflow-hidden"
      >
        {/* Semi-transparent background */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "var(--runner-btn-bg)", opacity: 0.15 }}
        />
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="relative block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: "var(--runner-text)", opacity: 0.5 }}
            animate={{ y: [0, -6, 0] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </motion.div>
  );
};
