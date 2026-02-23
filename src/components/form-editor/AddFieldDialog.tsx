import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Sparkles, FileText, Plus } from "lucide-react";
import { FIELD_TYPES, FIELD_CATEGORIES, type FieldType, type FieldTypeConfig } from "@/config/fieldTypes";

interface AddFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddField: (type: FieldType) => void;
}

const RECOMMENDED: FieldType[] = ["multiple_choice", "short_text", "long_text", "appointment"];

export const AddFieldDialog = ({ open, onOpenChange, onAddField }: AddFieldDialogProps) => {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? FIELD_TYPES.filter((f) => f.label.toLowerCase().includes(search.toLowerCase()))
    : FIELD_TYPES;

  const grouped = FIELD_CATEGORIES.map((cat) => ({
    category: cat,
    fields: filtered.filter((f) => f.category === cat),
  })).filter((g) => g.fields.length > 0);

  const handleSelect = (type: FieldType) => {
    onAddField(type);
    onOpenChange(false);
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <Tabs defaultValue="elements" className="flex flex-col h-full">
          <DialogHeader className="px-6 pt-6 pb-0">
            <TabsList className="w-full justify-start bg-transparent border-b rounded-none h-auto p-0 gap-6">
              <TabsTrigger
                value="elements"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-0 pb-3 font-medium"
              >
                Adicionar elementos
              </TabsTrigger>
              <TabsTrigger
                value="import"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-0 pb-3 font-medium"
              >
                Questões de importação
              </TabsTrigger>
            </TabsList>
          </DialogHeader>

          <TabsContent value="elements" className="flex-1 overflow-auto px-6 pb-6 mt-0">
            <div className="flex gap-6 mt-4">
              {/* Sidebar */}
              <div className="w-48 shrink-0 space-y-4">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar elementos..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recomendado</p>
                  <div className="space-y-1">
                    {RECOMMENDED.map((type) => {
                      const cfg = FIELD_TYPES.find((f) => f.type === type)!;
                      const Icon = cfg.icon;
                      return (
                        <button
                          key={type}
                          onClick={() => handleSelect(type)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors text-left"
                        >
                          <Icon className={`h-4 w-4 ${cfg.color}`} />
                          <span>{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Grid */}
              <div className="flex-1 space-y-6 min-w-0">
                {grouped.map(({ category, fields }) => (
                  <div key={category}>
                    <h3 className="text-sm font-semibold text-foreground mb-3">{category}</h3>
                    <div className="grid grid-cols-2 gap-1">
                      {fields.map((cfg) => {
                        const Icon = cfg.icon;
                        return (
                          <button
                            key={cfg.type}
                            onClick={() => handleSelect(cfg.type)}
                            className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors text-left"
                          >
                            <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                            <span className="truncate">{cfg.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="import" className="flex-1 overflow-auto px-6 pb-6 mt-0">
            <div className="flex gap-6 mt-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Formulário de perguntas
                </label>
                <Textarea
                  placeholder="Copie e cole ou digite suas perguntas e pressione Enter após cada uma."
                  className="min-h-[250px] resize-none"
                />
              </div>
              <div className="w-64 shrink-0 space-y-4">
                <div className="rounded-lg border-2 border-dashed border-primary/20 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Importar perguntas na maioria dos idiomas</p>
                      <p>Adicione as opções de resposta abaixo das suas perguntas.</p>
                      <p>Edite e ajuste a formatação posteriormente.</p>
                    </div>
                  </div>
                </div>
                <Button variant="outline" className="w-full" disabled>
                  Questões de importação
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
