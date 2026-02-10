export interface BackgroundCategory {
  name: string;
  emoji: string;
  images: string[];
}

// Free-to-use Unsplash images via direct URLs
export const BACKGROUND_CATEGORIES: BackgroundCategory[] = [
  {
    name: "Natureza",
    emoji: "🌿",
    images: [
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&q=80",
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&q=80",
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&q=80",
      "https://images.unsplash.com/photo-1518173946687-a243e2e3d4e9?w=1200&q=80",
      "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1200&q=80",
      "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1200&q=80",
    ],
  },
  {
    name: "Abstrato",
    emoji: "🎨",
    images: [
      "https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=1200&q=80",
      "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1200&q=80",
      "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=1200&q=80",
      "https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=1200&q=80",
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80",
      "https://images.unsplash.com/photo-1604076913837-52ab5f7c1ae4?w=1200&q=80",
    ],
  },
  {
    name: "Cidade",
    emoji: "🏙️",
    images: [
      "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1200&q=80",
      "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1200&q=80",
      "https://images.unsplash.com/photo-1444723121867-7a241cacace9?w=1200&q=80",
      "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=1200&q=80",
      "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1200&q=80",
      "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1200&q=80",
    ],
  },
  {
    name: "Minimalista",
    emoji: "⬜",
    images: [
      "https://images.unsplash.com/photo-1557683316-973673baf926?w=1200&q=80",
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1200&q=80",
      "https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?w=1200&q=80",
      "https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=1200&q=80",
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&q=80",
      "https://images.unsplash.com/photo-1533628635777-112b2239b1c7?w=1200&q=80",
    ],
  },
  {
    name: "Textura",
    emoji: "🧱",
    images: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1200&q=80",
      "https://images.unsplash.com/photo-1489f297c60f-69e7a4b276cd?w=1200&q=80",
      "https://images.unsplash.com/photo-1517999144091-3d9dca6d1e43?w=1200&q=80",
      "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1200&q=80",
      "https://images.unsplash.com/photo-1533035353720-f1c6a75cd8ab?w=1200&q=80",
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1200&q=80",
    ],
  },
];

export const PRESET_GRADIENTS = [
  { name: "Roxo-Rosa", value: "linear-gradient(135deg, #7C3AED, #EC4899)" },
  { name: "Azul-Ciano", value: "linear-gradient(135deg, #3B82F6, #06B6D4)" },
  { name: "Verde-Limão", value: "linear-gradient(135deg, #10B981, #84CC16)" },
  { name: "Laranja-Vermelho", value: "linear-gradient(135deg, #F97316, #EF4444)" },
  { name: "Índigo-Violeta", value: "linear-gradient(135deg, #6366F1, #8B5CF6)" },
  { name: "Rosa-Laranja", value: "linear-gradient(135deg, #EC4899, #F97316)" },
  { name: "Escuro", value: "linear-gradient(135deg, #1F2937, #111827)" },
  { name: "Oceano", value: "linear-gradient(135deg, #0F172A, #1E3A5F)" },
];

export const PRESET_SOLID_COLORS = [
  "#FFFFFF", "#FAFAFA", "#F3F4F6", "#E5E7EB",
  "#0F172A", "#18181B", "#1E293B", "#27272A",
  "#FFF7ED", "#FFF1F2", "#F0FDF4", "#EFF6FF",
  "#FEF3C7", "#FCE7F3", "#DBEAFE", "#D1FAE5",
];
