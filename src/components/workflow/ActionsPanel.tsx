import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WebhookManager } from "./WebhookManager";
import { ConnectPanel } from "./ConnectPanel";
import { MessagesPanel } from "./MessagesPanel";
import { Webhook, Plug, Mail } from "lucide-react";
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
        <TabsList className="w-full">
          <TabsTrigger value="webhooks" className="flex-1 gap-1 text-xs">
            <Webhook className="h-3 w-3" /> Webhooks
          </TabsTrigger>
          <TabsTrigger value="connect" className="flex-1 gap-1 text-xs">
            <Plug className="h-3 w-3" /> Connect
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex-1 gap-1 text-xs">
            <Mail className="h-3 w-3" /> Messages
          </TabsTrigger>
        </TabsList>
        <TabsContent value="webhooks" className="mt-4">
          <WebhookManager formId={formId} />
        </TabsContent>
        <TabsContent value="connect" className="mt-4">
          <ConnectPanel formId={formId} />
        </TabsContent>
        <TabsContent value="messages" className="mt-4">
          <MessagesPanel templates={emailTemplates} onUpdateTemplates={onUpdateEmailTemplates} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
