import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Tag, X } from "lucide-react";
import { useState } from "react";
import type { FormField, TaggingConfig } from "@/types/workflow";

interface TaggingPanelProps {
  fields: FormField[];
  tagging: TaggingConfig;
  onUpdateTagging: (tagging: TaggingConfig) => void;
}

const CHOICE_TYPES = ["multiple_choice", "dropdown", "image_choice", "yes_no", "checkbox"];

export const TaggingPanel = ({ fields, tagging, onUpdateTagging }: TaggingPanelProps) => {
  const [newTag, setNewTag] = useState("");
  const choiceFields = fields.filter((f) => CHOICE_TYPES.includes(f.type) && f.options?.length);

  const addTag = () => {
    if (!newTag.trim() || tagging.tags.includes(newTag.trim())) return;
    onUpdateTagging({ ...tagging, tags: [...tagging.tags, newTag.trim()] });
    setNewTag("");
  };

  const removeTag = (tag: string) => {
    const tags = tagging.tags.filter((t) => t !== tag);
    const field_tags = { ...tagging.field_tags };
    // Remove tag from all field mappings
    for (const fid of Object.keys(field_tags)) {
      for (const opt of Object.keys(field_tags[fid])) {
        field_tags[fid][opt] = field_tags[fid][opt].filter((t) => t !== tag);
      }
    }
    onUpdateTagging({ ...tagging, tags, field_tags });
  };

  const toggleOptionTag = (fieldId: string, option: string, tag: string) => {
    const field_tags = { ...tagging.field_tags };
    if (!field_tags[fieldId]) field_tags[fieldId] = {};
    const current = field_tags[fieldId][option] || [];
    if (current.includes(tag)) {
      field_tags[fieldId][option] = current.filter((t) => t !== tag);
    } else {
      field_tags[fieldId][option] = [...current, tag];
    }
    onUpdateTagging({ ...tagging, field_tags });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Etiquetas</h3>
        </div>
        <Switch
          checked={tagging.enabled}
          onCheckedChange={(enabled) => onUpdateTagging({ ...tagging, enabled })}
        />
      </div>

      {tagging.enabled && (
        <>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Tags disponíveis</p>
            <div className="flex flex-wrap gap-1.5">
              {tagging.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button onClick={() => removeTag(tag)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                className="h-8 text-xs flex-1"
                placeholder="Nova tag..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
              />
              <Button variant="outline" size="sm" onClick={addTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {tagging.tags.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">Associar tags às opções</h4>
              {choiceFields.map((field) => (
                <div key={field.id} className="border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium">{field.label || field.type}</p>
                  {field.options?.map((opt) => (
                    <div key={opt} className="space-y-1">
                      <span className="text-xs">{opt}</span>
                      <div className="flex flex-wrap gap-1">
                        {tagging.tags.map((tag) => {
                          const active = tagging.field_tags[field.id]?.[opt]?.includes(tag);
                          return (
                            <Badge
                              key={tag}
                              variant={active ? "default" : "outline"}
                              className="cursor-pointer text-[10px]"
                              onClick={() => toggleOptionTag(field.id, opt, tag)}
                            >
                              {tag}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
