using System.Windows.Media;

namespace kiosk_wpf_python.App;

public sealed class TerminalBuffer
{
    public TerminalBuffer(int initialRows, int columns)
    {
        Columns = columns;
        _rows = new List<TerminalCell[]>(initialRows);

        for (int i = 0; i < initialRows; i++)
            _rows.Add(CreateRow());
    }

    private readonly List<TerminalCell[]> _rows;

    public int Columns { get; }
    public int Rows => _rows.Count;

    public IReadOnlyList<TerminalCell[]> Cells => _rows;

    public int CursorRow { get; private set; }
    public int CursorCol { get; private set; }

    // Saved cursor position
    private int _savedCursorRow;
    private int _savedCursorCol;

    // Current text attributes
    public Color CurrentForeground { get; set; } = Colors.White;
    public Color CurrentBackground { get; set; } = Colors.Black;
    public CellAttributes CurrentAttributes { get; set; } = CellAttributes.None;

    // Default colors (used by reset)
    public Color DefaultForeground { get; set; } = Colors.White;
    public Color DefaultBackground { get; set; } = Colors.Black;

    public void WriteChar(char ch)
    {
        EnsureRowExists(CursorRow);

        if (CursorCol >= Columns)
        {
            CursorCol = 0;
            CursorRow++;
            EnsureRowExists(CursorRow);
        }

        var cell = _rows[CursorRow][CursorCol];
        cell.Char = ch;
        cell.Foreground = CurrentForeground;
        cell.Background = CurrentBackground;
        cell.Attributes = CurrentAttributes;

        CursorCol++;
    }

    private TerminalCell[] CreateRow()
    {
        var row = new TerminalCell[Columns];
        for (int i = 0; i < Columns; i++)
            row[i] = new TerminalCell
            {
                Background = DefaultBackground,
                Foreground = DefaultForeground
            };
        return row;
    }

    private void EnsureRowExists(int row)
    {
        while (_rows.Count <= row)
            _rows.Add(CreateRow());
    }

    public void NewLine()
    {
        CursorCol = 0;
        CursorRow++;
        EnsureRowExists(CursorRow);
    }

    public void CarriageReturn()
    {
        CursorCol = 0;
    }

    public void CursorUp(int n = 1)
    {
        CursorRow = Math.Max(0, CursorRow - n);
    }

    public void CursorDown(int n = 1)
    {
        CursorRow += n;
        EnsureRowExists(CursorRow);
    }

    public void CursorForward(int n = 1)
    {
        CursorCol = Math.Min(Columns - 1, CursorCol + n);
    }

    public void CursorBack(int n = 1)
    {
        CursorCol = Math.Max(0, CursorCol - n);
    }

    /// <summary>
    /// Set cursor to absolute position (1-based row/col from ANSI, converted to 0-based).
    /// </summary>
    public void SetCursorPosition(int row, int col)
    {
        CursorRow = Math.Max(0, row);
        CursorCol = Math.Max(0, Math.Min(Columns - 1, col));
        EnsureRowExists(CursorRow);
    }

    public void SaveCursor()
    {
        _savedCursorRow = CursorRow;
        _savedCursorCol = CursorCol;
    }

    public void RestoreCursor()
    {
        CursorRow = _savedCursorRow;
        CursorCol = _savedCursorCol;
        EnsureRowExists(CursorRow);
    }

    /// <summary>
    /// Erase in Line (EL) — CSI n K
    /// 0 = erase from cursor to end of line (default)
    /// 1 = erase from start of line to cursor
    /// 2 = erase entire line
    /// </summary>
    public void EraseLine(int mode = 0)
    {
        EnsureRowExists(CursorRow);
        var row = _rows[CursorRow];

        switch (mode)
        {
            case 0: // cursor to end
                for (int c = CursorCol; c < Columns; c++)
                    ResetCell(row[c]);
                break;

            case 1: // start to cursor
                for (int c = 0; c <= CursorCol && c < Columns; c++)
                    ResetCell(row[c]);
                break;

            case 2: // entire line
                for (int c = 0; c < Columns; c++)
                    ResetCell(row[c]);
                break;
        }
    }

    /// <summary>
    /// Erase in Display (ED) — CSI n J
    /// 0 = erase from cursor to end of screen (default)
    /// 1 = erase from start of screen to cursor
    /// 2 = erase entire screen
    /// 3 = erase entire screen and scrollback (same as 2 here)
    /// </summary>
    public void EraseScreen(int mode = 0)
    {
        switch (mode)
        {
            case 0: // cursor to end
                // Clear rest of current line
                EraseLine(0);
                // Clear all lines below
                for (int r = CursorRow + 1; r < _rows.Count; r++)
                    for (int c = 0; c < Columns; c++)
                        ResetCell(_rows[r][c]);
                break;

            case 1: // start to cursor
                // Clear all lines above
                for (int r = 0; r < CursorRow; r++)
                    for (int c = 0; c < Columns; c++)
                        ResetCell(_rows[r][c]);
                // Clear current line up to cursor
                EraseLine(1);
                break;

            case 2: // entire screen
            case 3: // entire screen + scrollback
                for (int r = 0; r < _rows.Count; r++)
                    for (int c = 0; c < Columns; c++)
                        ResetCell(_rows[r][c]);
                CursorRow = 0;
                CursorCol = 0;
                break;
        }
    }

    /// <summary>
    /// Delete n characters at cursor, shifting remaining cells left.
    /// </summary>
    public void DeleteChars(int n = 1)
    {
        EnsureRowExists(CursorRow);
        var row = _rows[CursorRow];

        for (int c = CursorCol; c < Columns; c++)
        {
            if (c + n < Columns)
            {
                row[c].Char = row[c + n].Char;
                row[c].Foreground = row[c + n].Foreground;
                row[c].Background = row[c + n].Background;
                row[c].Attributes = row[c + n].Attributes;
            }
            else
            {
                ResetCell(row[c]);
            }
        }
    }

    /// <summary>
    /// Insert n blank characters at cursor, shifting existing cells right.
    /// </summary>
    public void InsertChars(int n = 1)
    {
        EnsureRowExists(CursorRow);
        var row = _rows[CursorRow];

        for (int c = Columns - 1; c >= CursorCol; c--)
        {
            if (c - n >= CursorCol)
            {
                row[c].Char = row[c - n].Char;
                row[c].Foreground = row[c - n].Foreground;
                row[c].Background = row[c - n].Background;
                row[c].Attributes = row[c - n].Attributes;
            }
            else
            {
                ResetCell(row[c]);
            }
        }
    }

    /// <summary>
    /// Reset all attributes and colors to defaults.
    /// </summary>
    public void ResetAttributes()
    {
        CurrentForeground = DefaultForeground;
        CurrentBackground = DefaultBackground;
        CurrentAttributes = CellAttributes.None;
    }

    private void ResetCell(TerminalCell cell)
    {
        cell.Char = ' ';
        cell.Foreground = DefaultForeground;
        cell.Background = DefaultBackground;
        cell.Attributes = CellAttributes.None;
    }
}