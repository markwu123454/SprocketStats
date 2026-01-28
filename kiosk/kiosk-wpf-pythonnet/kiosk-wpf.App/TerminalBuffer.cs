using System.Windows.Media;

namespace kiosk_wpf.App;

public sealed class TerminalBuffer
{
    public TerminalBuffer(int rows, int columns)
    {
        Rows = rows;
        Columns = columns;
        Cells = new TerminalCell[rows, columns];

        for (var r = 0; r < rows; r++)
        for (var c = 0; c < columns; c++)
            Cells[r, c] = new TerminalCell();
    }

    public int Rows { get; }
    public int Columns { get; }

    public TerminalCell[,] Cells { get; }

    public int CursorRow { get; private set; }
    public int CursorCol { get; private set; }

    public Color CurrentForeground { get; set; } = Colors.White;
    public Color CurrentBackground { get; set; } = Colors.Black;

    public void WriteChar(char ch)
    {
        if (CursorRow >= Rows || CursorCol >= Columns)
            return;

        var cell = Cells[CursorRow, CursorCol];
        cell.Char = ch;
        cell.Foreground = CurrentForeground;
        cell.Background = CurrentBackground;

        CursorCol++;
        if (CursorCol >= Columns)
        {
            CursorCol = 0;
            CursorRow = Math.Min(CursorRow + 1, Rows - 1);
        }
    }

    public void NewLine()
    {
        CursorCol = 0;
        CursorRow = Math.Min(CursorRow + 1, Rows - 1);
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
        CursorRow = Math.Min(Rows - 1, CursorRow + n);
    }

    public void CursorForward(int n = 1)
    {
        CursorCol = Math.Min(Columns - 1, CursorCol + n);
    }

    public void CursorBack(int n = 1)
    {
        CursorCol = Math.Max(0, CursorCol - n);
    }

    public void ClearLine()
    {
        for (var c = 0; c < Columns; c++)
            Cells[CursorRow, c] = new TerminalCell();
    }

    public void ClearScreen()
    {
        for (var r = 0; r < Rows; r++)
        for (var c = 0; c < Columns; c++)
            Cells[r, c] = new TerminalCell();

        CursorRow = 0;
        CursorCol = 0;
    }
}