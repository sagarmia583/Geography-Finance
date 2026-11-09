const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯";

export function moveExpenseRow<T extends { id: string; voucherNo: string }>(
  rows: T[],
  id: string,
  targetIndex: number,
): T[] {
  if (!Number.isInteger(targetIndex)) return rows;

  const sourceIndex = rows.findIndex((row) => row.id === id);
  const destinationIndex = Math.max(0, Math.min(rows.length - 1, targetIndex));
  if (sourceIndex < 0 || sourceIndex === destinationIndex) return rows;

  const movedRow = rows[sourceIndex];
  if (!movedRow) return rows;

  const reordered = [...rows];
  reordered.splice(sourceIndex, 1);
  reordered.splice(destinationIndex, 0, movedRow);

  return reordered.map((row, index) => ({
    ...row,
    voucherNo: String(index + 1).replace(/\d/g, (digit) => BENGALI_DIGITS[Number(digit)]!),
  }));
}
