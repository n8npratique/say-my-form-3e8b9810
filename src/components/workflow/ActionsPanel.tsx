import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WebhookManager } from "./WebhookManager";
import { ConnectPanel } from "./ConnectPanel";
import { MessagesPanel } from "./MessagesPanel";
import { SheetsPanel } from "./SheetsPanel";
import { UnnichatPanel } from "./UnnichatPanel";
import { WhatsAppPanel } from "./WhatsAppPanel";
import { CalendarPanel } from "./CalendarPanel";
import { Webhook, Plug, Mail, FileSpreadsheet, MessageCircle, Phone, Calendar } from "lucide-react";
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
          <TabsTrigger value="messages" className="gap-1 text-xs px-0.5">
            <Mail className="h-3 w-3" />
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1 text-xs px-0.5">
            <Phone className="h-3 w-3" />
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1 text-xs px-0.5">
            <Calendar className="h-3 w-3" />
          </TabsTrigger>
          <TabsTrigger value="unnichat" className="gap-1 text-xs px-0.5">
            <MessageCircle className="h-3 w-3" />
          </TabsTrigger>
        </TabsList>
        <div className="flex justify-between text-[10px] text-muted-foreground px-0.5 mt-1 mb-3">
          <span className="w-1/7 text-center">Hooks</span>
          <span className="w-1/7 text-center">Link</span>
          <span className="w-1/7 text-center">Sheets</span>
          <span className="w-1/7 text-center">Email</span>
          <span className="w-1/7 text-center">WA</span>
          <span className="w-1/7 text-center">Cal</span>
          <span className="w-1/7 text-center">CRM</span>
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
          <MessagesPanel templates={emailTemplates} onUpdateTemplates={onUpdateEmailTemplates} formId={formId} />
        </TabsContent>
        <TabsContent value="whatsapp" className="mt-0">
          <WhatsAppPanel formId={formId} />
        </TabsContent>
        <TabsContent value="calendar" className="mt-0">
          <CalendarPanel formId={formId} fields={fields} />
        </TabsContent>
        <TabsContent value="unnichat" className="mt-0">
          <UnnichatPanel
            formId={formId}
            fields={fields}
            scoring={scoring}
            tagging={tagging}
            outcomes={outcomes}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
