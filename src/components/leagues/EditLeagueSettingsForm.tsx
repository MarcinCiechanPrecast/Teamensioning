import React, { useState } from "react";
import { Handshake, Lock, Minus, Plus, Trophy } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { leagueNameSchema, leagueSettingsSchema } from "@/lib/validation/league";

interface Props {
  leagueId: string;
  name: string;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  pointsLocked: boolean;
  /** A cup has no points settings: the form shows the name only. */
  isCup?: boolean;
  serverError?: string | null;
}

type FieldName = "name" | "pointsWin" | "pointsDraw" | "pointsLoss";

const FIELD_NAMES = new Set<PropertyKey>(["name", "pointsWin", "pointsDraw", "pointsLoss"]);

function isFieldName(key: PropertyKey | undefined): key is FieldName {
  return key !== undefined && FIELD_NAMES.has(key);
}

export default function EditLeagueSettingsForm({
  leagueId,
  name: initialName,
  pointsWin: initialWin,
  pointsDraw: initialDraw,
  pointsLoss: initialLoss,
  pointsLocked,
  isCup = false,
  serverError,
}: Props) {
  const [name, setName] = useState(initialName);
  const [pointsWin, setPointsWin] = useState(String(initialWin));
  const [pointsDraw, setPointsDraw] = useState(String(initialDraw));
  const [pointsLoss, setPointsLoss] = useState(String(initialLoss));
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});

  function validate() {
    const result =
      pointsLocked || isCup
        ? leagueNameSchema.safeParse({ name })
        : leagueSettingsSchema.safeParse({ name, pointsWin, pointsDraw, pointsLoss });

    if (result.success) {
      setErrors({});
      return true;
    }

    const next: Partial<Record<FieldName, string>> = {};
    for (const issue of result.error.issues) {
      const [key] = issue.path;
      if (isFieldName(key)) next[key] ??= issue.message;
    }
    setErrors(next);
    return false;
  }

  function clearFieldError(field: FieldName) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function clearPointsErrors() {
    setErrors((prev) => ({ ...prev, pointsWin: undefined, pointsDraw: undefined, pointsLoss: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form
      method="POST"
      action={`/api/leagues/${encodeURIComponent(leagueId)}/settings`}
      className="space-y-4"
      onSubmit={handleSubmit}
      noValidate
    >
      <FormField
        id="name"
        label={isCup ? "Cup name" : "League name"}
        value={name}
        onChange={(v) => {
          setName(v);
          clearFieldError("name");
        }}
        placeholder="Friday FIFA league"
        error={errors.name}
        icon={<Trophy className="size-4" />}
      />

      {isCup ? null : pointsLocked ? (
        <div className="space-y-3">
          {/* Plain text, not inputs: nothing here is submitted, which the endpoint reads as "points unchanged". */}
          <p className="text-muted-foreground text-sm">
            W {initialWin} / D {initialDraw} / L {initialLoss}
          </p>
          <Alert>
            <Lock />
            <AlertDescription>Points are locked because a score has been entered</AlertDescription>
          </Alert>
        </div>
      ) : (
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
            error={errors.pointsWin}
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
            error={errors.pointsDraw}
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
            error={errors.pointsLoss}
            icon={<Minus className="size-4" />}
          />
        </div>
      )}

      <ServerError message={serverError} />

      <SubmitButton pendingText="Saving..." icon={<Trophy className="size-4" />}>
        Save settings
      </SubmitButton>
    </form>
  );
}
