export type MineCell = {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacent: number;
};

export function toggleMineFlag(board: MineCell[][], row: number, col: number, mineLimit: number) {
  const cell = board[row]?.[col];
  const flagCount = board.flat().filter(item => item.isFlagged).length;
  if (!cell || cell.isRevealed || (!cell.isFlagged && flagCount >= mineLimit)) return board;

  return board.map((cells, rowIndex) => cells.map((item, colIndex) =>
    rowIndex === row && colIndex === col ? { ...item, isFlagged: !item.isFlagged } : item
  ));
}
