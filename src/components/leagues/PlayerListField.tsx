import { CircleAlert, Plus, User, X } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import type { PlayerRow } from "@/components/hooks/usePlayerList";
import { cn } from "@/lib/utils";

interface PlayerListFieldProps {
  rows: PlayerRow[];
  canAdd: boolean;
  canRemove: boolean;
  onAdd: () => void;
  onRemove: (id: number) => void;
  onChange: (id: number, value: string) => void;
  /** Per-row errors keyed by the row's stable id. */
  rowErrors: Partial<Record<number, string>>;
  /** List-level error (player count, duplicate names). */
  listError?: string;
}

export function PlayerListField({
  rows,
  canAdd,
  canRemove,
  onAdd,
  onRemove,
  onChange,
  rowErrors,
  listError,
}: PlayerListFieldProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-foreground mb-1 text-sm">Players</legend>

      {rows.map((row, index) => (
        <FormField
          key={row.id}
          id={`player-${String(row.id)}`}
          name="players"
          label={`Player ${String(index + 1)}`}
          value={row.value}
          onChange={(value) => {
            onChange(row.id, value);
          }}
          placeholder="Player name"
          error={rowErrors[row.id]}
          icon={<User className="size-4" />}
          endContent={
            <button
              type="button"
              onClick={() => {
                onRemove(row.id);
              }}
              disabled={!canRemove}
              className={cn(
                "text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 rounded-sm transition-colors",
                "focus-visible:ring-ring outline-hidden focus-visible:ring-2",
                "disabled:hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-30",
              )}
              aria-label={`Remove player ${String(index + 1)}`}
            >
              <X className="size-4" />
            </button>
          }
        />
      ))}

      {listError && (
        <p className="text-destructive flex items-center gap-1 text-xs">
          <CircleAlert className="size-3" />
          {listError}
        </p>
      )}

      <Button type="button" variant="outline" onClick={onAdd} disabled={!canAdd} className="w-full border-dashed">
        <Plus className="size-4" />
        Add player
      </Button>
    </fieldset>
  );
}
