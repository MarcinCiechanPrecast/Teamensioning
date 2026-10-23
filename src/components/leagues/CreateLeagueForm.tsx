import React, { useState } from "react";
import { Handshake, Minus, Plus, Trophy } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { PlayerListField } from "@/components/leagues/PlayerListField";
import { usePlayerList } from "@/components/hooks/usePlayerList";
import { createLeagueSchema } from "@/lib/validation/league";

interface Props {
  serverError?: string | null;
}

type FieldName = "name" | "pointsWin" | "pointsDraw" | "pointsLoss";

interface FormErrors {
  fields: Partial<Record<FieldName, string>>;
  rows: Partial<Record<number, string>>;
  list?: string;
}

const NO_ERRORS: FormErrors = { fields: {}, rows: {} };
const FIELD_NAMES = new Set<PropertyKey>(["name", "pointsWin", "pointsDraw", "pointsLoss"]);

function isFieldName(key: PropertyKey | undefined): key is FieldName {
  return key !== undefined && FIELD_NAMES.has(key);
}

export default function CreateLeagueForm({ serverError }: Props) {
  const [name, setName] = useState("");
  const [pointsWin, setPointsWin] = useState("3");
  const [pointsDraw, setPointsDraw] = useState("1");
  const [pointsLoss, setPointsLoss] = useState("0");
  const players = usePlayerList();
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  function validate() {
    // Mirror the endpoint: empty rows are dropped before validation.
    const filledRows = players.rows.filter((row) => row.value.trim() !== "");
    const result = createLeagueSchema.safeParse({
      name,
      pointsWin,
      pointsDraw,
      pointsLoss,
      players: filledRows.map((row) => row.value),
    });

    if (result.success) {
      setErrors(NO_ERRORS);
      return true;
    }

    const next: FormErrors = { fields: {}, rows: {} };
    for (const issue of result.error.issues) {
      const [key, index] = issue.path;
      if (isFieldName(key)) {
        next.fields[key] ??= issue.message;
      } else if (key === "players" && typeof index === "number") {
        // Index refers to the filtered list; map it back to the row's stable id.
        const row = filledRows.at(index);
        if (row) next.rows[row.id] ??= issue.message;
      } else if (key === "players") {
        next.list ??= issue.message;
      }
    }
    setErrors(next);
    return false;
  }

  function clearFieldError(field: FieldName) {
    if (errors.fields[field]) setErrors((prev) => ({ ...prev, fields: { ...prev.fields, [field]: undefined } }));
  }

  function clearPointsErrors() {
    setErrors((prev) => ({
      ...prev,
      fields: { ...prev.fields, pointsWin: undefined, pointsDraw: undefined, pointsLoss: undefined },
    }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/leagues" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="League name"
        value={name}
        onChange={(v) => {
          setName(v);
          clearFieldError("name");
        }}
        placeholder="Friday FIFA league"
        error={errors.fields.name}
        icon={<Trophy className="size-4" />}
      />

      <div className="grid grid-cols-3 gap-3">
        <FormField
          id="pointsWin"
          type="number"
          label="Win"
          value={pointsWin}
          onChange={(v) => {
            setPointsWin(v);
            clearPointsErrors();
          }}
          error={errors.fields.pointsWin}
          icon={<Plus className="size-4" />}
        />
        <FormField
          id="pointsDraw"
          type="number"
          label="Draw"
          value={pointsDraw}
          onChange={(v) => {
            setPointsDraw(v);
            clearPointsErrors();
          }}
          error={errors.fields.pointsDraw}
          icon={<Handshake className="size-4" />}
        />
        <FormField
          id="pointsLoss"
          type="number"
          label="Loss"
          value={pointsLoss}
          onChange={(v) => {
            setPointsLoss(v);
            clearPointsErrors();
          }}
          error={errors.fields.pointsLoss}
          icon={<Minus className="size-4" />}
        />
      </div>

      <PlayerListField
        rows={players.rows}
        canAdd={players.canAdd}
        canRemove={players.canRemove}
        onAdd={players.addRow}
        onRemove={(id) => {
          players.removeRow(id);
          setErrors((prev) => ({ ...prev, rows: { ...prev.rows, [id]: undefined }, list: undefined }));
        }}
        onChange={(id, value) => {
          players.updateRow(id, value);
          setErrors((prev) => ({ ...prev, rows: { ...prev.rows, [id]: undefined }, list: undefined }));
        }}
        rowErrors={errors.rows}
        listError={errors.list}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Creating league..." icon={<Trophy className="size-4" />}>
        Create league
      </SubmitButton>
    </form>
  );
}
