import { CircleAlert, Plus, User, X } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { Button } from "@/components/ui/button";
import type { PlayerRow } from "@/components/hooks/usePlayerList";

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
      <legend className="mb-1 text-sm text-blue-100/80">Players</legend>

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
              className="absolute top-1/2 right-3 -translate-y-1/2 text-white/40 transition-colors hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-white/40"
              aria-label={`Remove player ${String(index + 1)}`}
            >
              <X className="size-4" />
            </button>
          }
        />
      ))}

      {listError && (
        <p className="flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {listError}
        </p>
      )}

      <Button
        type="button"
        variant="ghost"
        onClick={onAdd}
        disabled={!canAdd}
        className="w-full rounded-lg border border-dashed border-white/20 text-blue-100/80 hover:bg-white/10 hover:text-white"
      >
        <Plus className="size-4" />
        Add player
      </Button>
    </fieldset>
  );
}
