import type { EmailTemplate } from "@/types/workflow";

interface EmailPreviewProps {
  template: EmailTemplate;
}

const replaceVars = (text: string) =>
  text
    .replace(/\{\{form_name\}\}/g, "Meu Formulário")
    .replace(/\{\{respondent_email\}\}/g, "usuario@exemplo.com")
    .replace(/\{\{score\}\}/g, "85")
    .replace(/\{\{outcome\}\}/g, "Perfil A");

export const EmailPreview = ({ template }: EmailPreviewProps) => {
  return (
    <div className="border rounded-lg overflow-hidden bg-background shadow-sm max-w-[280px]">
      {/* Header image */}
      {template.header_image_url && (
        <div className="w-full h-24 bg-muted">
          <img
            src={template.header_image_url}
            alt="Header"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Subject */}
        <h4 className="font-semibold text-sm">
          {replaceVars(template.subject || "Assunto do email")}
        </h4>

        {/* Body */}
        <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {replaceVars(template.body || "Corpo do email...")}
        </p>

        {/* CTA */}
        {template.cta_text && (
          <div className="pt-2">
            <div className="bg-primary text-primary-foreground text-xs font-medium px-4 py-2 rounded text-center">
              {template.cta_text}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {template.footer && (
        <div className="border-t px-4 py-2">
          <p className="text-[10px] text-muted-foreground">{replaceVars(template.footer)}</p>
        </div>
      )}
    </div>
  );
};
