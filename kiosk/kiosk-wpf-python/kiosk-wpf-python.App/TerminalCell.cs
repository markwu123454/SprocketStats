using System.Windows.Media;

namespace kiosk_wpf_python.App;

public sealed class TerminalCell
{
    public char Char { get; set; } = ' ';
    public Color Foreground { get; set; } = Colors.White;
    public Color Background { get; set; } = Colors.Black;
}