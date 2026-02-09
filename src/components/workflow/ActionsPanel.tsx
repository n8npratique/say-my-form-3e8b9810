import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WebhookManager } from "./WebhookManager";
import { Webhook, Plug, Mail } from "lucide-react";

interface ActionsPanelProps {
  formId: string;
}

export const ActionsPanel = ({ formId }: ActionsPanelProps) => {
  return (
    <div className="border-l w-80 bg-card/30 p-4">
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
          <div className="text-center py-8 text-muted-foreground text-xs">
            <Plug className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Integrações em breve.</p>
          </div>
        </TabsContent>
        <TabsContent value="messages" className="mt-4">
          <div className="text-center py-8 text-muted-foreground text-xs">
            <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Notificações por email em breve.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
