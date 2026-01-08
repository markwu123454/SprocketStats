using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Text;
using Avalonia.Media;

namespace kiosk_avalonia;

public sealed class AnsiConsole
{
    private static readonly Dictionary<int, IBrush> AnsiColors = new()
    {
        [30] = new SolidColorBrush(Color.FromRgb(0, 0, 0)),
        [31] = new SolidColorBrush(Color.FromRgb(255, 77, 77)),
        [32] = new SolidColorBrush(Color.FromRgb(0, 255, 111)),
        [33] = new SolidColorBrush(Color.FromRgb(255, 255, 102)),
        [34] = new SolidColorBrush(Color.FromRgb(102, 179, 255)),
        [35] = new SolidColorBrush(Color.FromRgb(255, 102, 255)),
        [36] = new SolidColorBrush(Color.FromRgb(0, 255, 255)),
        [37] = Brushes.White,

        [90] = new SolidColorBrush(Color.FromRgb(85, 85, 85)),
        [91] = new SolidColorBrush(Color.FromRgb(255, 77, 77)),
        [92] = new SolidColorBrush(Color.FromRgb(0, 255, 111)),
        [93] = new SolidColorBrush(Color.FromRgb(255, 255, 102)),
        [94] = new SolidColorBrush(Color.FromRgb(102, 179, 255)),
        [95] = new SolidColorBrush(Color.FromRgb(255, 102, 255)),
        [96] = new SolidColorBrush(Color.FromRgb(0, 255, 255)),
        [97] = Brushes.White
    };

    private Color _currentColor = Color.FromRgb(255, 255, 255);

    private IBrush _currentForeground = Brushes.White;
    private int _cursorLineOffset;
    public ObservableCollection<ConsoleLine> Lines { get; } = new();

    public void Write(string text)
    {
        Parse(text);
    }

    public void Clear()
    {
        Lines.Clear();
        _cursorLineOffset = 0;
        _currentColor = Color.FromRgb(255, 255, 255);
    }

    private void Parse(string text)
    {
        if (Lines.Count == 0)
            Lines.Add(new ConsoleLine());

        var currentLine = Lines[^1];
        var buffer = new StringBuilder();

        void Flush()
        {
            if (buffer.Length == 0)
                return;

            currentLine.Spans.Add(new ConsoleSpan
            {
                Text = buffer.ToString(),
                Foreground = _currentForeground
            });

            buffer.Clear();
        }

        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];

            // ANSI escape
            if (c == '\x1b' && i + 1 < text.Length && text[i + 1] == '[')
            {
                Flush();

                var end = text.IndexOfAny(new[] { 'm', 'A', 'K' }, i);
                if (end == -1)
                    break;

                var code = text.Substring(i + 2, end - i - 2);

                switch (text[end])
                {
                    case 'm': // color
                    {
                        var codes = code.Split(';', StringSplitOptions.RemoveEmptyEntries);
                        foreach (var s in codes)
                        {
                            if (!int.TryParse(s, out var v))
                                continue;
                            if (v == 0) _currentForeground = Brushes.White;
                            else if (AnsiColors.TryGetValue(v, out var brush)) _currentForeground = brush;
                        }

                        break;
                    }

                    case 'A': // cursor up
                    {
                        var n = string.IsNullOrEmpty(code) ? 1 : int.Parse(code);
                        _cursorLineOffset += n;
                        _cursorLineOffset = Math.Min(_cursorLineOffset, Lines.Count - 1);
                        break;
                    }

                    case 'K': // erase line
                    {
                        var index = Lines.Count - 1 - _cursorLineOffset;
                        if (index >= 0 && index < Lines.Count) Lines[index].Spans.Clear();
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
                Lines.Add(currentLine);
                _cursorLineOffset = 0;
                continue;
            }

            // carriage return
            if (c == '\r')
            {
                Flush();
                _cursorLineOffset = 0;
                continue;
            }

            buffer.Append(c);
        }

        Flush();
    }
}

public sealed class ConsoleLine
{
    public ObservableCollection<ConsoleSpan> Spans { get; } = new();
}

public sealed class ConsoleSpan
{
    public string Text { get; init; } = "";
    public IBrush Foreground { get; init; } = Brushes.White;
}