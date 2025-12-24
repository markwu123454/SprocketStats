using System.Text;
using MediaColor = System.Windows.Media.Color;

namespace kiosk_wpf.App;

public sealed class AnsiConsole
{
    private readonly List<ConsoleLine> _lines = new();

    private MediaColor _currentColor = MediaColor.FromRgb(255, 255, 255);
    private int _cursorLineOffset = 0;

    private static readonly Dictionary<int, MediaColor> AnsiColors = new()
    {
        [30] = MediaColor.FromRgb(0, 0, 0),
        [31] = MediaColor.FromRgb(255, 77, 77),
        [32] = MediaColor.FromRgb(0, 255, 111),
        [33] = MediaColor.FromRgb(255, 255, 102),
        [34] = MediaColor.FromRgb(102, 179, 255),
        [35] = MediaColor.FromRgb(255, 102, 255),
        [36] = MediaColor.FromRgb(0, 255, 255),
        [37] = MediaColor.FromRgb(255, 255, 255),

        [90] = MediaColor.FromRgb(85, 85, 85),
        [91] = MediaColor.FromRgb(255, 77, 77),
        [92] = MediaColor.FromRgb(0, 255, 111),
        [93] = MediaColor.FromRgb(255, 255, 102),
        [94] = MediaColor.FromRgb(102, 179, 255),
        [95] = MediaColor.FromRgb(255, 102, 255),
        [96] = MediaColor.FromRgb(0, 255, 255),
        [97] = MediaColor.FromRgb(255, 255, 255)
    };

    public IReadOnlyList<ConsoleLine> Lines => _lines;

    public void Write(string text)
    {
        Parse(text);
    }

    public void Clear()
    {
        _lines.Clear();
        _cursorLineOffset = 0;
        _currentColor = MediaColor.FromRgb(255, 255, 255);
    }

    private void Parse(string text)
    {
        if (_lines.Count == 0)
            _lines.Add(new ConsoleLine());

        var currentLine = _lines[^1];
        var buffer = new StringBuilder();

        void Flush()
        {
            if (buffer.Length == 0)
                return;

            currentLine.Spans.Add(new ConsoleSpan
            {
                Text = buffer.ToString(),
                Color = _currentColor
            });

            buffer.Clear();
        }

        for (int i = 0; i < text.Length; i++)
        {
            char c = text[i];

            // ANSI escape
            if (c == '\x1b' && i + 1 < text.Length && text[i + 1] == '[')
            {
                Flush();

                int end = text.IndexOfAny(new[] { 'm', 'A', 'K' }, i);
                if (end == -1)
                    break;

                string code = text.Substring(i + 2, end - i - 2);

                switch (text[end])
                {
                    case 'm': // color
                    {
                        var codes = code.Split(';', StringSplitOptions.RemoveEmptyEntries);
                        foreach (var s in codes)
                        {
                            int v = int.Parse(s);
                            if (v == 0)
                                _currentColor = MediaColor.FromRgb(255, 255, 255);
                            else if (AnsiColors.TryGetValue(v, out var color))
                                _currentColor = color;
                        }

                        break;
                    }

                    case 'A': // cursor up
                    {
                        int n = string.IsNullOrEmpty(code) ? 1 : int.Parse(code);
                        _cursorLineOffset += n;
                        _cursorLineOffset = Math.Min(_cursorLineOffset, _lines.Count - 1);
                        break;
                    }

                    case 'K': // erase line
                    {
                        int index = _lines.Count - 1 - _cursorLineOffset;
                        if (index >= 0 && index < _lines.Count)
                        {
                            _lines.RemoveAt(index);

                            if (_cursorLineOffset > 0)
                                _cursorLineOffset--;
                        }

                        break;
                    }
                }

                i = end;
                continue;
            }

            // newline
            if (c == '\n')
            {
                Flush();
                currentLine = new ConsoleLine();
                _lines.Add(currentLine);
                _cursorLineOffset = 0;
                continue;
            } 
            if (c == '\r')
            {
                Flush();
                currentLine.Spans.Clear();
                _cursorLineOffset = 0;
                continue;
            }


            // normal character
            buffer.Append(c);
        }

        Flush();
    }
}

public sealed class ConsoleLine
{
    public List<ConsoleSpan> Spans { get; } = new();
}

public sealed class ConsoleSpan
{
    public string Text { get; set; } = "";
    public MediaColor Color { get; set; }
}