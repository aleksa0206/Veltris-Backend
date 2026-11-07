// Board order: tasks in a column are sorted by a float `position`. Inserting between two cards
// takes the midpoint, so a move writes one row. Repeated inserts into the same gap halve it each
// time; once it falls below MIN_GAP the column is renumbered (see taskRepository.moveTask).

export const POSITION_STEP = 1024;
export const MIN_GAP = 1e-6;

/** Position for a card placed between `before` (the card above) and `after` (the card below). */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return POSITION_STEP;
  if (before === null) return after! - POSITION_STEP;
  if (after === null) return before + POSITION_STEP;
  return (before + after) / 2;
}

export function needsRenumber(before: number | null, after: number | null): boolean {
  return before !== null && after !== null && after - before < MIN_GAP;
}
