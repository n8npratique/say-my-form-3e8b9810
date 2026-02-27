import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { FormField, FieldLogic } from "@/types/workflow";
import { WorkflowStepCard } from "./WorkflowStepCard";
import { ZoomIn, ZoomOut, Maximize2, Plus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WorkflowCanvasProps {
  fields: FormField[];
  logic: FieldLogic[];
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  onInsertField?: (afterIndex: number) => void;
}

interface BranchLine {
  fromIdx: number;
  toIdx: number | "end";
  label: string;
  isDefault: boolean;
  ruleIndex: number;
  fieldId: string;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

const OP_LABELS: Record<string, string> = {
  equals: "=",
  not_equals: "\u2260",
  contains: "\u2283",
  greater_than: ">",
  less_than: "<",
  is_set: "\u2713",
  is_not_set: "\u2717",
};

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "\u2026" : s;
}

export const WorkflowCanvas = ({ fields, logic, selectedFieldId, onSelectField, onInsertField }: WorkflowCanvasProps) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [hoveredBranch, setHoveredBranch] = useState<string | null>(null);
  const [cardPositions, setCardPositions] = useState<Map<number, DOMRect>>(new Map());
  const panStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const cardsRowRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef<Map<number, HTMLDivElement>>(new Map());

  const hasLogic = useCallback(
    (fieldId: string) => logic.some((l) => l.field_id === fieldId && l.rules.length > 0),
    [logic]
  );

  // Collect all branch connections with labels
  const branchLines = useMemo<BranchLine[]>(() => {
    const lines: BranchLine[] = [];
    for (const l of logic) {
      const fromIdx = fields.findIndex((f) => f.id === l.field_id);
      if (fromIdx < 0) continue;

      l.rules.forEach((r, ri) => {
        const opLabel = OP_LABELS[r.condition.op] || r.condition.op;
        const valStr = r.condition.value != null ? String(r.condition.value) : "";
        const condLabel = ["is_set", "is_not_set"].includes(r.condition.op)
          ? opLabel
          : `${opLabel} ${truncate(valStr, 12)}`;

        if (r.action?.type === "jump_to" && r.action.target) {
          const toIdx = fields.findIndex((f) => f.id === r.action.target);
          if (toIdx >= 0) {
            lines.push({ fromIdx, toIdx, label: condLabel, isDefault: false, ruleIndex: ri, fieldId: l.field_id });
          }
        } else if (r.action?.type === "end") {
          lines.push({ fromIdx, toIdx: "end", label: condLabel, isDefault: false, ruleIndex: ri, fieldId: l.field_id });
        }
      });

      // Default action
      if (l.rules.length > 0) {
        const da = l.default_action;
        if (da.type === "jump_to" && da.target) {
          const toIdx = fields.findIndex((f) => f.id === da.target);
          if (toIdx >= 0) {
            lines.push({ fromIdx, toIdx, label: "default", isDefault: true, ruleIndex: -1, fieldId: l.field_id });
          }
        } else if (da.type === "end") {
          lines.push({ fromIdx, toIdx: "end", label: "default", isDefault: true, ruleIndex: -1, fieldId: l.field_id });
        }
      }
    }
    return lines;
  }, [logic, fields]);

  // Measure card positions after render
  useEffect(() => {
    const measure = () => {
      if (!cardsRowRef.current) return;
      const rowRect = cardsRowRef.current.getBoundingClientRect();
      const map = new Map<number, DOMRect>();
      cardEls.current.forEach((el, idx) => {
        const r = el.getBoundingClientRect();
        // Make relative to the cards row container
        map.set(idx, new DOMRect(r.x - rowRect.x, r.y - rowRect.y, r.width, r.height));
      });
      setCardPositions(map);
    };
    // Measure after a short delay so the DOM is settled
    const timer = setTimeout(measure, 50);
    return () => clearTimeout(timer);
  }, [fields, logic, zoom]);

  // Zoom handlers
  const handleZoomIn = () => setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  const handleZoomOut = () => setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  const handleFit = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((z) => Math.min(Math.max(z + delta, MIN_ZOOM), MAX_ZOOM));
    }
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // Dynamic canvas height based on branch count
  const maxCurveDepth = branchLines.length > 0 ? Math.min(branchLines.length, 5) : 0;
  const canvasHeight = 160 + maxCurveDepth * 28;

  // Render SVG branch curves using real DOM positions
  const renderBranchSVG = () => {
    if (branchLines.length === 0 || cardPositions.size === 0) return null;

    // Full SVG covers the cards row area
    const lastCard = cardPositions.get(fields.length - 1);
    const firstCard = cardPositions.get(0);
    if (!firstCard || !lastCard) return null;
    const svgWidth = lastCard.x + lastCard.width + 60;
    const svgHeight = canvasHeight;

    return (
      <svg
        className="absolute top-0 left-0 pointer-events-none"
        width={svgWidth}
        height={svgHeight}
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Arrowhead markers */}
          <marker id="arrow-primary" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,1 L6,4 L0,7" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
          </marker>
          <marker id="arrow-amber" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,1 L6,4 L0,7" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
          </marker>
          <marker id="arrow-red" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,1 L6,4 L0,7" fill="none" stroke="#ef4444" strokeWidth="1.5" />
          </marker>
          <marker id="arrow-muted" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,1 L6,4 L0,7" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" />
          </marker>
        </defs>

        {branchLines.map((line, i) => {
          const fromRect = cardPositions.get(line.fromIdx);
          if (!fromRect) return null;

          const isEnd = line.toIdx === "end";
          const toRect = isEnd ? null : cardPositions.get(line.toIdx as number);
          if (!isEnd && !toRect) return null;

          const isSelected = line.fieldId === selectedFieldId;
          const branchKey = `${line.fieldId}-${line.ruleIndex}`;
          const isHovered = hoveredBranch === branchKey;

          // From: bottom-center of source card
          const fromX = fromRect.x + fromRect.width / 2;
          const fromY = fromRect.y + fromRect.height;

          // To: bottom-center of target card (or right edge + 30 for "end")
          let toX: number, toY: number;
          if (isEnd) {
            toX = fromRect.x + fromRect.width + 30;
            toY = fromRect.y + fromRect.height / 2;
          } else {
            toX = toRect!.x + toRect!.width / 2;
            toY = toRect!.y + toRect!.height;
          }

          const isForward = isEnd || (line.toIdx as number) > line.fromIdx;
          const isBackward = !isEnd && (line.toIdx as number) < line.fromIdx;

          // Stagger curve depth based on distance and index
          const distance = isEnd ? 1 : Math.abs((line.toIdx as number) - line.fromIdx);
          const baseDepth = 24 + distance * 10;
          const stagger = (i % 4) * 14;
          const curveY = fromRect.y + fromRect.height + baseDepth + stagger;

          // Color scheme
          let strokeColor: string;
          let markerEnd: string;
          let dashArray = "none";
          if (line.isDefault) {
            strokeColor = "hsl(var(--muted-foreground))";
            markerEnd = "url(#arrow-muted)";
            dashArray = "4 3";
          } else if (isBackward) {
            strokeColor = "#ef4444";
            markerEnd = "url(#arrow-red)";
            dashArray = "6 3";
          } else {
            strokeColor = "hsl(var(--primary))";
            markerEnd = "url(#arrow-primary)";
          }

          // Opacity: highlight selected/hovered, dim the rest
          const hasActive = selectedFieldId && branchLines.some((bl) => bl.fieldId === selectedFieldId);
          let opacity: number;
          if (isHovered) opacity = 1;
          else if (isSelected) opacity = 0.9;
          else if (hasActive) opacity = 0.15;
          else opacity = 0.5;

          const strokeWidth = isHovered ? 2.5 : isSelected ? 2 : 1.5;

          // Build path
          let path: string;
          if (isEnd) {
            // Short downward curve then right to an "X"
            const midY = fromY + 20 + stagger;
            path = `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
          } else {
            path = `M ${fromX} ${fromY} C ${fromX} ${curveY}, ${toX} ${curveY}, ${toX} ${toY}`;
          }

          // Label position: midpoint of the curve
          const labelX = (fromX + toX) / 2;
          const labelY = isEnd ? (fromY + toY) / 2 + 10 + stagger : curveY + 4;

          return (
            <g key={`branch-${i}`}>
              {/* Invisible wider path for hover target */}
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onMouseEnter={() => setHoveredBranch(branchKey)}
                onMouseLeave={() => setHoveredBranch(null)}
              />
              {/* Visible path */}
              <path
                d={path}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={dashArray}
                opacity={opacity}
                markerEnd={markerEnd}
                style={{ transition: "opacity 0.2s, stroke-width 0.15s" }}
              />

              {/* "End" marker */}
              {isEnd && (
                <g opacity={opacity} style={{ transition: "opacity 0.2s" }}>
                  <circle cx={toX} cy={toY} r={8} fill="#ef4444" opacity={0.15} />
                  <line x1={toX - 3} y1={toY - 3} x2={toX + 3} y2={toY + 3} stroke="#ef4444" strokeWidth={2} />
                  <line x1={toX + 3} y1={toY - 3} x2={toX - 3} y2={toY + 3} stroke="#ef4444" strokeWidth={2} />
                </g>
              )}

              {/* Label on curve */}
              {(isHovered || isSelected) && (
                <g style={{ transition: "opacity 0.2s" }} opacity={isHovered ? 1 : 0.85}>
                  <rect
                    x={labelX - 2}
                    y={labelY - 10}
                    width={line.label.length * 6.5 + 12}
                    height={16}
                    rx={4}
                    fill="hsl(var(--card))"
                    stroke={strokeColor}
                    strokeWidth={1}
                    style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))" }}
                  />
                  <text
                    x={labelX + 4}
                    y={labelY + 2}
                    fontSize={10}
                    fontFamily="ui-monospace, monospace"
                    fontWeight={600}
                    fill={strokeColor}
                  >
                    {line.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="relative overflow-hidden bg-muted/20 border-b" style={{ height: canvasHeight }}>
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-card/90 backdrop-blur-sm border rounded-lg p-1 shadow-sm">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut} title="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[10px] font-mono text-muted-foreground w-10 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn} title="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFit} title="Ajustar">
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Legend (when branches exist) */}
      {branchLines.length > 0 && (
        <div className="absolute bottom-2 left-3 z-20 flex items-center gap-3 text-[10px] text-muted-foreground bg-card/80 backdrop-blur-sm border rounded-md px-2.5 py-1">
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 rounded-full" style={{ background: "hsl(var(--primary))" }} />
            Salto adiante
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 rounded-full bg-red-500" style={{ backgroundImage: "repeating-linear-gradient(90deg, #ef4444 0, #ef4444 4px, transparent 4px, transparent 7px)" }} />
            Salto para trás
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 rounded-full" style={{ background: "hsl(var(--muted-foreground))", backgroundImage: "repeating-linear-gradient(90deg, hsl(var(--muted-foreground)) 0, hsl(var(--muted-foreground)) 3px, transparent 3px, transparent 6px)" }} />
            Default
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="h-3 w-3 text-red-500" />
            Encerrar
          </span>
        </div>
      )}

      {/* Canvas area with pan & zoom */}
      <div
        ref={containerRef}
        className={`w-full h-full ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          ref={innerRef}
          className="relative h-full flex items-start"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 50%",
            transition: isPanning ? "none" : "transform 0.15s ease-out",
          }}
        >
          <div
            ref={cardsRowRef}
            className="relative flex items-start gap-0 px-6 pt-6"
            style={{ minWidth: "max-content" }}
          >
            {/* SVG layer for branch curves */}
            {renderBranchSVG()}

            {/* Cards and connectors */}
            {fields.map((field, i) => (
              <div
                key={field.id}
                ref={(el) => { if (el) cardEls.current.set(i, el); else cardEls.current.delete(i); }}
                className="flex items-center shrink-0"
              >
                <WorkflowStepCard
                  field={field}
                  index={i}
                  selected={selectedFieldId === field.id}
                  hasLogic={hasLogic(field.id)}
                  onClick={() => onSelectField(field.id)}
                />

                {i < fields.length - 1 && (
                  <div className="flex items-center mx-1.5 shrink-0">
                    <div className="w-4 h-px bg-border" />
                    {onInsertField && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onInsertField(i); }}
                        className="h-6 w-6 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-all group"
                        title="Inserir campo aqui"
                      >
                        <Plus className="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                      </button>
                    )}
                    <div className="w-4 h-px bg-border" />
                  </div>
                )}
              </div>
            ))}

            {/* Trailing insert button */}
            {fields.length > 0 && onInsertField && (
              <div className="flex items-center ml-1.5 shrink-0">
                <div className="w-4 h-px bg-border" />
                <button
                  onClick={(e) => { e.stopPropagation(); onInsertField(fields.length - 1); }}
                  className="h-6 w-6 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-all group"
                  title="Adicionar campo ao final"
                >
                  <Plus className="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
