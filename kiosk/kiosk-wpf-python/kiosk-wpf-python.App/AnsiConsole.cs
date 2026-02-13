using System.Windows.Media;

namespace kiosk_wpf_python.App;

public sealed class AnsiConsole
{
    // Standard foreground colors (30–37)
    private static readonly Dictionary<int, Color> AnsiForeground = new()
    {
        [30] = Colors.Black,
        [31] = Color.FromRgb(255, 77, 77),
        [32] = Color.FromRgb(0, 255, 111),
        [33] = Color.FromRgb(255, 255, 102),
        [34] = Color.FromRgb(102, 179, 255),
        [35] = Color.FromRgb(255, 102, 255),
        [36] = Color.FromRgb(0, 255, 255),
        [37] = Colors.White,
    };

    // Bright foreground colors (90–97)
    private static readonly Dictionary<int, Color> AnsiBrightForeground = new()
    {
        [90] = Color.FromRgb(85, 85, 85),
        [91] = Color.FromRgb(255, 85, 85),
        [92] = Color.FromRgb(85, 255, 85),
        [93] = Color.FromRgb(255, 255, 85),
        [94] = Color.FromRgb(85, 85, 255),
        [95] = Color.FromRgb(255, 85, 255),
        [96] = Color.FromRgb(85, 255, 255),
        [97] = Colors.White,
    };

    // Standard background colors (40–47)
    private static readonly Dictionary<int, Color> AnsiBackground = new()
    {
        [40] = Colors.Black,
        [41] = Color.FromRgb(255, 77, 77),
        [42] = Color.FromRgb(0, 255, 111),
        [43] = Color.FromRgb(255, 255, 102),
        [44] = Color.FromRgb(102, 179, 255),
        [45] = Color.FromRgb(255, 102, 255),
        [46] = Color.FromRgb(0, 255, 255),
        [47] = Colors.White,
    };

    // Bright background colors (100–107)
    private static readonly Dictionary<int, Color> AnsiBrightBackground = new()
    {
        [100] = Color.FromRgb(85, 85, 85),
        [101] = Color.FromRgb(255, 85, 85),
        [102] = Color.FromRgb(85, 255, 85),
        [103] = Color.FromRgb(255, 255, 85),
        [104] = Color.FromRgb(85, 85, 255),
        [105] = Color.FromRgb(255, 85, 255),
        [106] = Color.FromRgb(85, 255, 255),
        [107] = Colors.White,
    };

    // 256-color palette (indices 0–255)
    private static readonly Color[] Palette256 = Build256Palette();

    private static Color[] Build256Palette()
    {
        var palette = new Color[256];

        // 0–7: standard colors
        Color[] std =
        [
            Colors.Black,
            Color.FromRgb(255, 77, 77),
            Color.FromRgb(0, 255, 111),
            Color.FromRgb(255, 255, 102),
            Color.FromRgb(102, 179, 255),
            Color.FromRgb(255, 102, 255),
            Color.FromRgb(0, 255, 255),
            Colors.White
        ];
        for (int i = 0; i < 8; i++) palette[i] = std[i];

        // 8–15: bright colors
        Color[] bright =
        [
            Color.FromRgb(85, 85, 85),
            Color.FromRgb(255, 85, 85),
            Color.FromRgb(85, 255, 85),
            Color.FromRgb(255, 255, 85),
            Color.FromRgb(85, 85, 255),
            Color.FromRgb(255, 85, 255),
            Color.FromRgb(85, 255, 255),
            Colors.White
        ];
        for (int i = 0; i < 8; i++) palette[8 + i] = bright[i];

        // 16–231: 6x6x6 color cube
        int[] levels = [0, 95, 135, 175, 215, 255];
        for (int r = 0; r < 6; r++)
            for (int g = 0; g < 6; g++)
                for (int b = 0; b < 6; b++)
                    palette[16 + (36 * r) + (6 * g) + b] =
                        Color.FromRgb((byte)levels[r], (byte)levels[g], (byte)levels[b]);

        // 232–255: grayscale ramp
        for (int i = 0; i < 24; i++)
        {
            var v = (byte)(8 + i * 10);
            palette[232 + i] = Color.FromRgb(v, v, v);
        }

        return palette;
    }

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

            // ── OSC sequences: ESC ] ... ST ──
            if (c == '\x1b' && i + 1 < text.Length && text[i + 1] == ']')
            {
                // Skip until ST (ESC \) or BEL (\x07)
                var j = i + 2;
                while (j < text.Length)
                {
                    if (text[j] == '\x07') { i = j; break; }
                    if (text[j] == '\x1b' && j + 1 < text.Length && text[j + 1] == '\\') { i = j + 1; break; }
                    j++;
                }
                if (j >= text.Length) i = text.Length - 1;
                continue;
            }

            // ── CSI sequences: ESC [ ... ──
            if (c == '\x1b' && i + 1 < text.Length && text[i + 1] == '[')
            {
                // Find the terminating character
                var end = -1;
                for (int j = i + 2; j < text.Length; j++)
                {
                    var ch = text[j];
                    // CSI terminators are in the range 0x40–0x7E
                    if (ch >= 0x40 && ch <= 0x7E)
                    {
                        end = j;
                        break;
                    }
                }

                if (end == -1)
                    break; // incomplete sequence, stop

                var body = text.Substring(i + 2, end - i - 2);
                HandleCsi(body, text[end]);
                i = end;
                continue;
            }

            // ── ESC 7 / ESC 8 (save/restore cursor) ──
            if (c == '\x1b' && i + 1 < text.Length)
            {
                var next = text[i + 1];
                if (next == '7') { Buffer.SaveCursor(); i++; continue; }
                if (next == '8') { Buffer.RestoreCursor(); i++; continue; }
                // ESC c = full reset
                if (next == 'c') { Buffer.EraseScreen(2); Buffer.ResetAttributes(); i++; continue; }
            }

            // ── Regular characters ──
            switch (c)
            {
                case '\n':
                    Buffer.NewLine();
                    break;

                case '\r':
                    Buffer.CarriageReturn();
                    break;

                case '\t':
                    // Tab: advance to next 8-column stop
                    var nextTab = ((Buffer.CursorCol / 8) + 1) * 8;
                    Buffer.CursorForward(nextTab - Buffer.CursorCol);
                    break;

                case '\b':
                    Buffer.CursorBack(1);
                    break;

                case '\x07': // BEL — ignore
                    break;

                default:
                    if (c >= ' ') // printable
                        Buffer.WriteChar(c);
                    break;
            }
        }
    }

    /// <summary>
    /// Handle a CSI (Control Sequence Introducer) escape: ESC [ &lt;body&gt; &lt;command&gt;
    /// </summary>
    private void HandleCsi(string body, char command)
    {
        switch (command)
        {
            // ── SGR (Select Graphic Rendition) ──
            case 'm':
                HandleSgr(body);
                break;

            // ── Cursor movement ──
            case 'A': // Cursor Up
                Buffer.CursorUp(ParseInt(body, 1));
                break;

            case 'B': // Cursor Down
                Buffer.CursorDown(ParseInt(body, 1));
                break;

            case 'C': // Cursor Forward
                Buffer.CursorForward(ParseInt(body, 1));
                break;

            case 'D': // Cursor Back
                Buffer.CursorBack(ParseInt(body, 1));
                break;

            case 'E': // Cursor Next Line
                Buffer.CursorDown(ParseInt(body, 1));
                Buffer.CarriageReturn();
                break;

            case 'F': // Cursor Previous Line
                Buffer.CursorUp(ParseInt(body, 1));
                Buffer.CarriageReturn();
                break;

            case 'G': // Cursor Horizontal Absolute (1-based)
            {
                var col = ParseInt(body, 1) - 1;
                Buffer.SetCursorPosition(Buffer.CursorRow, col);
                break;
            }

            case 'H': // Cursor Position (row;col, 1-based)
            case 'f': // Horizontal Vertical Position (same as H)
            {
                var parts = body.Split(';');
                var row = (parts.Length >= 1 ? ParseInt(parts[0], 1) : 1) - 1;
                var col = (parts.Length >= 2 ? ParseInt(parts[1], 1) : 1) - 1;
                Buffer.SetCursorPosition(row, col);
                break;
            }

            // ── Erase ──
            case 'J': // Erase in Display
                Buffer.EraseScreen(ParseInt(body, 0));
                break;

            case 'K': // Erase in Line
                Buffer.EraseLine(ParseInt(body, 0));
                break;

            // ── Insert/Delete ──
            case 'P': // Delete Characters
                Buffer.DeleteChars(ParseInt(body, 1));
                break;

            case '@': // Insert Characters
                Buffer.InsertChars(ParseInt(body, 1));
                break;

            // ── Scrolling (basic stubs) ──
            case 'S': // Scroll Up — ignored for now
            case 'T': // Scroll Down — ignored for now
                break;

            // ── Cursor save/restore (CSI s / CSI u) ──
            case 's':
                Buffer.SaveCursor();
                break;

            case 'u':
                Buffer.RestoreCursor();
                break;

            // ── Private modes: CSI ? ... h / l  (e.g. show/hide cursor) — ignore ──
            case 'h':
            case 'l':
                break;

            // ── Device Status Report — ignore ──
            case 'n':
                break;
        }
    }

    /// <summary>
    /// Handle SGR (Select Graphic Rendition): CSI ... m
    /// Supports: reset, bold, dim, italic, underline, blink, inverse, hidden, strikethrough,
    /// standard/bright foreground and background (30–37, 40–47, 90–97, 100–107),
    /// 256-color (38;5;N / 48;5;N), and true-color RGB (38;2;R;G;B / 48;2;R;G;B).
    /// </summary>
    private void HandleSgr(string body)
    {
        if (string.IsNullOrEmpty(body) || body == "0")
        {
            Buffer.ResetAttributes();
            return;
        }

        var parts = body.Split(';', StringSplitOptions.RemoveEmptyEntries);

        for (int i = 0; i < parts.Length; i++)
        {
            if (!int.TryParse(parts[i], out var v))
                continue;

            switch (v)
            {
                // ── Reset ──
                case 0:
                    Buffer.ResetAttributes();
                    break;

                // ── Attributes on ──
                case 1:
                    Buffer.CurrentAttributes |= CellAttributes.Bold;
                    break;
                case 2:
                    Buffer.CurrentAttributes |= CellAttributes.Dim;
                    break;
                case 3:
                    Buffer.CurrentAttributes |= CellAttributes.Italic;
                    break;
                case 4:
                    Buffer.CurrentAttributes |= CellAttributes.Underline;
                    break;
                case 5:
                case 6:
                    Buffer.CurrentAttributes |= CellAttributes.Blink;
                    break;
                case 7:
                    Buffer.CurrentAttributes |= CellAttributes.Inverse;
                    break;
                case 8:
                    Buffer.CurrentAttributes |= CellAttributes.Hidden;
                    break;
                case 9:
                    Buffer.CurrentAttributes |= CellAttributes.Strikethrough;
                    break;

                // ── Attributes off ──
                case 21: // double underline or bold off (varies)
                case 22:
                    Buffer.CurrentAttributes &= ~(CellAttributes.Bold | CellAttributes.Dim);
                    break;
                case 23:
                    Buffer.CurrentAttributes &= ~CellAttributes.Italic;
                    break;
                case 24:
                    Buffer.CurrentAttributes &= ~CellAttributes.Underline;
                    break;
                case 25:
                    Buffer.CurrentAttributes &= ~CellAttributes.Blink;
                    break;
                case 27:
                    Buffer.CurrentAttributes &= ~CellAttributes.Inverse;
                    break;
                case 28:
                    Buffer.CurrentAttributes &= ~CellAttributes.Hidden;
                    break;
                case 29:
                    Buffer.CurrentAttributes &= ~CellAttributes.Strikethrough;
                    break;

                // ── Standard foreground 30–37 ──
                case >= 30 and <= 37:
                    if (AnsiForeground.TryGetValue(v, out var fg))
                        Buffer.CurrentForeground = fg;
                    break;

                // ── Extended foreground: 38;5;N or 38;2;R;G;B ──
                case 38:
                    i = ParseExtendedColor(parts, i, isForeground: true);
                    break;

                // ── Default foreground ──
                case 39:
                    Buffer.CurrentForeground = Buffer.DefaultForeground;
                    break;

                // ── Standard background 40–47 ──
                case >= 40 and <= 47:
                    if (AnsiBackground.TryGetValue(v, out var bg))
                        Buffer.CurrentBackground = bg;
                    break;

                // ── Extended background: 48;5;N or 48;2;R;G;B ──
                case 48:
                    i = ParseExtendedColor(parts, i, isForeground: false);
                    break;

                // ── Default background ──
                case 49:
                    Buffer.CurrentBackground = Buffer.DefaultBackground;
                    break;

                // ── Bright foreground 90–97 ──
                case >= 90 and <= 97:
                    if (AnsiBrightForeground.TryGetValue(v, out var bfg))
                        Buffer.CurrentForeground = bfg;
                    break;

                // ── Bright background 100–107 ──
                case >= 100 and <= 107:
                    if (AnsiBrightBackground.TryGetValue(v, out var bbg))
                        Buffer.CurrentBackground = bbg;
                    break;
            }
        }
    }

    /// <summary>
    /// Parse extended color sequences: 5;N (256-color) or 2;R;G;B (true-color).
    /// Returns the updated index into the parts array.
    /// </summary>
    private int ParseExtendedColor(string[] parts, int i, bool isForeground)
    {
        if (i + 1 >= parts.Length)
            return i;

        if (!int.TryParse(parts[i + 1], out var mode))
            return i;

        if (mode == 5 && i + 2 < parts.Length)
        {
            // 256-color: 38;5;N or 48;5;N
            if (int.TryParse(parts[i + 2], out var idx) && idx >= 0 && idx < 256)
            {
                if (isForeground)
                    Buffer.CurrentForeground = Palette256[idx];
                else
                    Buffer.CurrentBackground = Palette256[idx];
            }
            return i + 2;
        }

        if (mode == 2 && i + 4 < parts.Length)
        {
            // True color RGB: 38;2;R;G;B or 48;2;R;G;B
            if (int.TryParse(parts[i + 2], out var r) &&
                int.TryParse(parts[i + 3], out var g) &&
                int.TryParse(parts[i + 4], out var b))
            {
                var color = Color.FromRgb(
                    (byte)Math.Clamp(r, 0, 255),
                    (byte)Math.Clamp(g, 0, 255),
                    (byte)Math.Clamp(b, 0, 255));

                if (isForeground)
                    Buffer.CurrentForeground = color;
                else
                    Buffer.CurrentBackground = color;
            }
            return i + 4;
        }

        return i + 1; // skip unknown sub-mode
    }

    private static int ParseInt(string s, int defaultValue)
    {
        if (string.IsNullOrEmpty(s))
            return defaultValue;
        return int.TryParse(s, out var v) ? v : defaultValue;
    }
}