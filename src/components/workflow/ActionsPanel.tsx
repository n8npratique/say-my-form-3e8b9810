import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WebhookManager } from "./WebhookManager";
import { ConnectPanel } from "./ConnectPanel";
import { MessagesPanel } from "./MessagesPanel";
import { SheetsPanel } from "./SheetsPanel";
import { UnnichatPanel } from "./UnnichatPanel";
import { WhatsAppPanel } from "./WhatsAppPanel";
import { ChatGuruPanel } from "./ChatGuruPanel";
import { Webhook, Plug, Mail, FileSpreadsheet, MessageCircle, MessageSquare, Phone } from "lucide-react";
import type { EmailTemplate, ScoringConfig, TaggingConfig, OutcomesConfig, FormField } from "@/types/workflow";

interface ActionsPanelProps {
  formId: string;
  emailTemplates: EmailTemplate[];
  onUpdateEmailTemplates: (templates: EmailTemplate[]) => void;
  fields?: FormField[];
  scoring?: ScoringConfig | null;
  tagging?: TaggingConfig | null;
  outcomes?: OutcomesConfig | null;
}

export const ActionsPanel = ({
  formId,
  emailTemplates,
  onUpdateEmailTemplates,
  fields = [],
  scoring = null,
  tagging = null,
  outcomes = null,
}: ActionsPanelProps) => {
  const hasEmailField = fields.some((f) => {
    const t = f.type?.toLowerCase();
    if (t === "email" || t === "email_input") return true;
    if (t === "contact_info" && f.contact_fields?.includes("email")) return true;
    return false;
  });
  const hasPhoneField = fields.some((f) => {
    const t = f.type?.toLowerCase();
    if (t === "phone" || t === "phone_input") return true;
    if (t === "contact_info" && f.contact_fields?.includes("phone")) return true;
    return false;
  });
  // Calendar integration is now handled exclusively by the appointment field config

  const MissingFieldWarning = ({ fieldType, integration }: { fieldType: string; integration: string }) => (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-center space-y-2">
      <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto">
        <Mail className="h-5 w-5 text-yellow-600" />
      </div>
      <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
        Campo de {fieldType} não encontrado
      </p>
      <p className="text-xs text-muted-foreground">
        Adicione um campo de <strong>{fieldType}</strong> ao formulário para habilitar a integração com {integration}.
      </p>
    </div>
  );

  return (
    <div className="border-l w-80 bg-card/30 p-4 overflow-y-auto">
      <h3 className="font-display font-semibold text-sm mb-4">Actions</h3>
      <Tabs defaultValue="webhooks">
        <TabsList className="w-full grid grid-cols-7">
          <TabsTrigger value="webhooks" className="gap-1 text-xs px-0.5">
            <Webhook className="h-3 w-3" />
          </TabsTrigger>
          <TabsTrigger value="connect" className="gap-1 text-xs px-0.5">
            <Plug className="h-3 w-3" />
          </TabsTrigger>
          <TabsTrigger value="sheets" className="gap-1 text-xs px-0.5">
            <FileSpreadsheet className="h-3 w-3" />
          </TabsTrigger>
          <TabsTrigger value="messages" className={`gap-1 text-xs px-0.5 ${!hasEmailField ? "opacity-50" : ""}`}>
            <Mail className="h-3 w-3" />
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className={`gap-1 text-xs px-0.5 ${!hasPhoneField ? "opacity-50" : ""}`}>
            <Phone className="h-3 w-3" />
          </TabsTrigger>
          <TabsTrigger value="chatguru" className={`gap-1 text-xs px-0.5 ${!hasPhoneField ? "opacity-50" : ""}`}>
            <MessageSquare className="h-3 w-3" />
          </TabsTrigger>
          <TabsTrigger value="unnichat" className={`gap-1 text-xs px-0.5 ${!hasPhoneField ? "opacity-50" : ""}`}>
            <MessageCircle className="h-3 w-3" />
          </TabsTrigger>
        </TabsList>
        <div className="flex justify-between text-[10px] text-muted-foreground px-0.5 mt-1 mb-3">
          <span className="flex-1 text-center">Hooks</span>
          <span className="flex-1 text-center">Link</span>
          <span className="flex-1 text-center">Sheets</span>
          <span className="flex-1 text-center">Email</span>
          <span className="flex-1 text-center">WA</span>
          <span className="flex-1 text-center">Guru</span>
          <span className="flex-1 text-center">CRM</span>
        </div>
        <TabsContent value="webhooks" className="mt-0">
          <WebhookManager formId={formId} />
        </TabsContent>
        <TabsContent value="connect" className="mt-0">
          <ConnectPanel formId={formId} />
        </TabsContent>
        <TabsContent value="sheets" className="mt-0">
          <SheetsPanel formId={formId} />
        </TabsContent>
        <TabsContent value="messages" className="mt-0">
          {hasEmailField ? (
            <MessagesPanel templates={emailTemplates} onUpdateTemplates={onUpdateEmailTemplates} formId={formId} fields={fields} hasAppointment={fields.some((f) => f.type === "appointment")} />
          ) : (
            <MissingFieldWarning fieldType="email" integration="Email" />
          )}
        </TabsContent>
        <TabsContent value="whatsapp" className="mt-0">
          {hasPhoneField ? (
            <WhatsAppPanel formId={formId} fields={fields} hasAppointment={fields.some((f) => f.type === "appointment")} />
          ) : (
            <MissingFieldWarning fieldType="telefone" integration="WhatsApp" />
          )}
        </TabsContent>
        <TabsContent value="chatguru" className="mt-0">
          {hasPhoneField ? (
            <ChatGuruPanel formId={formId} fields={fields} />
          ) : (
            <MissingFieldWarning fieldType="telefone" integration="ChatGuru" />
          )}
        </TabsContent>
        <TabsContent value="unnichat" className="mt-0">
          {hasPhoneField ? (
            <UnnichatPanel
              formId={formId}
              fields={fields}
              scoring={scoring}
              tagging={tagging}
              outcomes={outcomes}
            />
          ) : (
            <MissingFieldWarning fieldType="telefone" integration="Unnichat" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
