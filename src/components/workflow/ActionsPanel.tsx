import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WebhookManager } from "./WebhookManager";
import { ConnectPanel } from "./ConnectPanel";
import { MessagesPanel } from "./MessagesPanel";
import { SheetsPanel } from "./SheetsPanel";
import { Webhook, Plug, Mail, FileSpreadsheet } from "lucide-react";
import type { EmailTemplate } from "@/types/workflow";

interface ActionsPanelProps {
  formId: string;
  emailTemplates: EmailTemplate[];
  onUpdateEmailTemplates: (templates: EmailTemplate[]) => void;
}

export const ActionsPanel = ({ formId, emailTemplates, onUpdateEmailTemplates }: ActionsPanelProps) => {
  return (
    <div className="border-l w-80 bg-card/30 p-4 overflow-y-auto">
      <h3 className="font-display font-semibold text-sm mb-4">Actions</h3>
      <Tabs defaultValue="webhooks">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="webhooks" className="gap-1 text-xs px-1">
            <Webhook className="h-3 w-3" />
          </TabsTrigger>
          <TabsTrigger value="connect" className="gap-1 text-xs px-1">
            <Plug className="h-3 w-3" />
          </TabsTrigger>
          <TabsTrigger value="sheets" className="gap-1 text-xs px-1">
            <FileSpreadsheet className="h-3 w-3" />
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-1 text-xs px-1">
            <Mail className="h-3 w-3" />
          </TabsTrigger>
        </TabsList>
        <div className="flex justify-between text-[10px] text-muted-foreground px-0.5 mt-1 mb-3">
          <span className="w-1/4 text-center">Webhooks</span>
          <span className="w-1/4 text-center">Connect</span>
          <span className="w-1/4 text-center">Sheets</span>
          <span className="w-1/4 text-center">Messages</span>
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
      </Tabs>
    </div>
  );
};
