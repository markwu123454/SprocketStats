using System.Windows.Media;

namespace kiosk_wpf.App;

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

    public Color CurrentForeground { get; set; } = Colors.White;
    public Color CurrentBackground { get; set; } = Colors.Black;

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

        CursorCol++;
    }
    
    private TerminalCell[] CreateRow()
    {
        var row = new TerminalCell[Columns];
        for (int i = 0; i < Columns; i++)
            row[i] = new TerminalCell();
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

    public void ClearLine()
    {
        EnsureRowExists(CursorRow);
        _rows[CursorRow] = CreateRow();
    }


    public void ClearScreen()
    {
        for (int i = 0; i < _rows.Count; i++)
            _rows[i] = CreateRow();

        CursorRow = 0;
        CursorCol = 0;
    }

}