export type MediaType = "video" | "image";

interface MediaInfo {
  type: MediaType;
  embedUrl: string;
  /** true when the URL points to a video file (mp4/webm/etc.) instead of a YouTube/Vimeo embed */
  direct?: boolean;
}

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const VIMEO_REGEX = /vimeo\.com\/(\d+)/;
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|ogg|avi|mkv)(\?.*)?$/i;
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)(\?.*)?$/i;

export function parseMediaUrl(url: string): MediaInfo | null {
  if (!url?.trim()) return null;

  const ytMatch = url.match(YOUTUBE_REGEX);
  if (ytMatch) {
    return { type: "video", embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}` };
  }

  const vimeoMatch = url.match(VIMEO_REGEX);
  if (vimeoMatch) {
    return { type: "video", embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  }

  if (VIDEO_EXTENSIONS.test(url)) {
    return { type: "video", embedUrl: url, direct: true };
  }

  if (IMAGE_EXTENSIONS.test(url)) {
    return { type: "image", embedUrl: url };
  }

  // Fallback: try as image if it looks like a URL
  try {
    new URL(url);
    return { type: "image", embedUrl: url };
  } catch {
    return null;
  }
}

export function detectMediaType(url: string): MediaType | null {
  const info = parseMediaUrl(url);
  return info?.type ?? null;
}
