import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Plug } from "lucide-react";
import { ServiceAccountManager } from "@/components/integrations/ServiceAccountManager";
import { SheetsIntegrationTable } from "@/components/integrations/SheetsIntegrationTable";

const WorkspaceIntegrations = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [workspaceName, setWorkspaceName] = useState("");

  useEffect(() => {
    if (workspaceId) {
      supabase
        .from("workspaces")
        .select("name")
        .eq("id", workspaceId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setWorkspaceName(data.name);
        });
    }
  }, [workspaceId]);

  if (!workspaceId) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/workspace/${workspaceId}`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-display font-bold gradient-text">Pratique Forms</span>
            </div>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium">{workspaceName}</span>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium flex items-center gap-1">
              <Plug className="h-4 w-4" /> Integrações
            </span>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Integrações</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie Service Accounts e conexões com Google Sheets
          </p>
        </div>

        <ServiceAccountManager workspaceId={workspaceId} />
        <SheetsIntegrationTable workspaceId={workspaceId} />
      </main>
    </div>
  );
};

export default WorkspaceIntegrations;
