using System.Windows.Media;

namespace kiosk_wpf.App;

public sealed class AnsiConsole
{
    private static readonly Dictionary<int, Color> AnsiColors = new()
    {
        [30] = Colors.Black,
        [31] = Color.FromRgb(255, 77, 77),
        [32] = Color.FromRgb(0, 255, 111),
        [33] = Color.FromRgb(255, 255, 102),
        [34] = Color.FromRgb(102, 179, 255),
        [35] = Color.FromRgb(255, 102, 255),
        [36] = Color.FromRgb(0, 255, 255),
        [37] = Colors.White,

        [90] = Color.FromRgb(85, 85, 85),
        [91] = Color.FromRgb(255, 77, 77),
        [92] = Color.FromRgb(0, 255, 111),
        [93] = Color.FromRgb(255, 255, 102),
        [94] = Color.FromRgb(102, 179, 255),
        [95] = Color.FromRgb(255, 102, 255),
        [96] = Color.FromRgb(0, 255, 255),
        [97] = Colors.White
    };

    public AnsiConsole(int rows = 4, int columns = 300)
    {
        Buffer = new TerminalBuffer(rows, columns);
    }

    public TerminalBuffer Buffer { get; }

    public void Write(string text)
    {
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];

            // ANSI escape
            if (c == '\x1b' && i + 1 < text.Length && text[i + 1] == '[')
            {
                var end = text.IndexOfAny(['m', 'A', 'B', 'C', 'D', 'K', 'J'], i);
                if (end == -1)
                    break;

                var code = text.Substring(i + 2, end - i - 2);
                HandleEscape(code, text[end]);
                i = end;
                continue;
            }

            switch (c)
            {
                case '\n':
                    Buffer.NewLine();
                    break;

                case '\r':
                    Buffer.CarriageReturn();
                    break;

                default:
                    Buffer.WriteChar(c);
                    break;
            }
        }
    }

    private void HandleEscape(string code, char command)
    {
        var n = string.IsNullOrEmpty(code) ? 1 : int.Parse(code);

        switch (command)
        {
            case 'm': // colors
                foreach (var part in code.Split(';', StringSplitOptions.RemoveEmptyEntries))
                {
                    var v = int.Parse(part);
                    if (v == 0)
                        Buffer.CurrentForeground = Colors.White;
                    else if (AnsiColors.TryGetValue(v, out var color))
                        Buffer.CurrentForeground = color;
                }

                break;

            case 'A': Buffer.CursorUp(n); break;
            case 'B': Buffer.CursorDown(n); break;
            case 'C': Buffer.CursorForward(n); break;
            case 'D': Buffer.CursorBack(n); break;

            case 'K': Buffer.ClearLine(); break;
            case 'J': Buffer.ClearScreen(); break;
        }
    }
}