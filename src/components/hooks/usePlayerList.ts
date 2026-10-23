import { useRef, useState } from "react";

export const MIN_PLAYER_ROWS = 3;
export const MAX_PLAYER_ROWS = 20;

export interface PlayerRow {
  /** Stable key so removing a middle row does not shift input state. */
  id: number;
  value: string;
}

function initialRows(): PlayerRow[] {
  // Deterministic ids keep server-rendered and hydrated markup identical.
  return Array.from({ length: MIN_PLAYER_ROWS }, (_, index) => ({ id: index, value: "" }));
}

export function usePlayerList() {
  const [rows, setRows] = useState<PlayerRow[]>(initialRows);
  const nextId = useRef(MIN_PLAYER_ROWS);

  const canAdd = rows.length < MAX_PLAYER_ROWS;
  const canRemove = rows.length > MIN_PLAYER_ROWS;

  function addRow() {
    if (!canAdd) return;
    const id = nextId.current++;
    setRows((prev) => [...prev, { id, value: "" }]);
  }

  function removeRow(id: number) {
    if (!canRemove) return;
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function updateRow(id: number, value: string) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, value } : row)));
  }

  return { rows, canAdd, canRemove, addRow, removeRow, updateRow };
}
