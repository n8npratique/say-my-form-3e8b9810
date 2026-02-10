import { parseMediaUrl } from "@/lib/mediaUtils";
import type { FormField } from "@/components/form-editor/FieldItem";

interface FieldMediaProps {
  field: FormField;
}

export const FieldMedia = ({ field }: FieldMediaProps) => {
  if (!field.media_url) return null;

  const mediaInfo = parseMediaUrl(field.media_url);
  if (!mediaInfo) return null;

  if (mediaInfo.type === "video") {
    return (
      <div className="relative w-full rounded-xl overflow-hidden" style={{ paddingBottom: "56.25%" }}>
        <iframe
          src={mediaInfo.embedUrl}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="Mídia do campo"
        />
      </div>
    );
  }

  return (
    <img
      src={mediaInfo.embedUrl}
      alt="Mídia do campo"
      className="w-full max-h-80 object-contain rounded-xl"
    />
  );
};
