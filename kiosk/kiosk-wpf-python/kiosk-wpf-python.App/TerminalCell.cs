using System.Windows.Media;

namespace kiosk_wpf_python.App;

[Flags]
public enum CellAttributes
{
    None = 0,
    Bold = 1 << 0,
    Dim = 1 << 1,
    Italic = 1 << 2,
    Underline = 1 << 3,
    Blink = 1 << 4,
    Inverse = 1 << 5,
    Hidden = 1 << 6,
    Strikethrough = 1 << 7
}

public sealed class TerminalCell
{
    public char Char { get; set; } = ' ';
    public Color Foreground { get; set; } = Colors.White;
    public Color Background { get; set; } = Colors.Black;
    public CellAttributes Attributes { get; set; } = CellAttributes.None;
}