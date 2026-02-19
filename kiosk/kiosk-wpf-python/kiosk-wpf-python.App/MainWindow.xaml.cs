using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;

namespace kiosk_wpf_python.App;

public partial class MainWindow
{
    private readonly AnsiConsole _console = new();
    private readonly List<string> _commandHistory = new();
    private int _historyIndex = -1;
    private bool _isBusy;
    
    private CancellationTokenSource? _completionCts;
    private record CompletionItem(string Name, string Complete, string Type);
    
    private static readonly Dictionary<string, string> _autoPairs = new()
    {
        { "(", ")" },
        { "[", "]" },
        { "{", "}" },
        { "\"", "\"" },
        { "'", "'" },
        { "`", "`" },
    };

    public MainWindow()
    {
        InitializeComponent();
        
        CommandInput.LostFocus += (_, _) => CompletionPopup.IsOpen = false;
        Deactivated += (_, _) => CompletionPopup.IsOpen = false;
        StateChanged += (_, _) => CompletionPopup.IsOpen = false;

        // Subscribe to real-time log events from Python
        App.Python.LogReceived += OnPythonLog;

        ContentRendered += OnRendered;
    }

    private void OnPythonLog(string message)
    {
        // This receives raw text from stderr (including ANSI codes)
        // Just append it directly - no JSON parsing needed
        if (!string.IsNullOrWhiteSpace(message))
        {
            AppendLog(message);
        }
    }

    private async void OnRendered(object? sender, EventArgs e)
    {
        await Task.Run(() =>
        {
            try
            {
                // First ping to verify connection
                var pingRes = App.Python.Call(new { cmd = "ping" });
                HandlePythonResponse(pingRes);
            }
            catch (Exception ex)
            {
                AppendLog($"\x1b[31mPing failed: {ex.Message}\x1b[0m");
            }

            try
            {
                // Then initialize Python environment
                var initRes = App.Python.Call(new { cmd = "init" });
                HandlePythonResponse(initRes);
            }
            catch (InvalidOperationException ex)
            {
                // This exception contains the Python error message
                AppendLog($"\x1b[31m{ex.Message}\x1b[0m");
                AppendLog("\x1b[33mYou may still be able to use some functionality\x1b[0m");
            }
            catch (Exception ex)
            {
                AppendLog($"\x1b[31mFailed to initialize Python: {ex.Message}\x1b[0m");
            }
        });
    }

    // ===============================
    // Command input (REPL)
    // ===============================
    private void CommandInput_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Up:
            {
                if (CompletionPopup.IsOpen)
                {
                    var idx = CompletionList.SelectedIndex;
                    CompletionList.SelectedIndex = Math.Max(0, idx - 1);
                    CompletionList.ScrollIntoView(CompletionList.SelectedItem);
                    e.Handled = true;
                    break;
                }

                if (_commandHistory.Count == 0)
                    return;

                if (_historyIndex == -1)
                    _historyIndex = _commandHistory.Count - 1;
                else if (_historyIndex > 0)
                    _historyIndex--;

                CommandInput.Text = _commandHistory[_historyIndex];
                CommandInput.CaretIndex = CommandInput.Text.Length;
                e.Handled = true;
                break;
            }

            case Key.Down:
            {
                if (CompletionPopup.IsOpen)
                {
                    var idx = CompletionList.SelectedIndex;
                    CompletionList.SelectedIndex = Math.Min(CompletionList.Items.Count - 1, idx + 1);
                    CompletionList.ScrollIntoView(CompletionList.SelectedItem);
                    e.Handled = true;
                    break;
                }

                if (_commandHistory.Count == 0 || _historyIndex == -1)
                    return;

                if (_historyIndex < _commandHistory.Count - 1)
                {
                    _historyIndex++;
                    CommandInput.Text = _commandHistory[_historyIndex];
                }
                else
                {
                    _historyIndex = -1;
                    CommandInput.Clear();
                }

                CommandInput.CaretIndex = CommandInput.Text.Length;
                e.Handled = true;
                break;
            }
            
            case Key.Tab:
                if (CompletionPopup.IsOpen && CompletionList.SelectedItem is CompletionItem tabItem)
                {
                    ApplyCompletion(tabItem);
                    e.Handled = true;
                }
                break;

            case Key.Escape:
                if (CompletionPopup.IsOpen)
                {
                    CompletionPopup.IsOpen = false;
                    e.Handled = true;
                }
                break;

            case Key.Enter:
            {
                var code = CommandInput.Text.Trim();
                CommandInput.Clear();

                if (string.IsNullOrWhiteSpace(code))
                    return;

                if (_commandHistory.Count == 0 || _commandHistory[^1] != code)
                    _commandHistory.Add(code);

                _historyIndex = -1;

                AppendLog($"\x1b[32m>>>\x1b[0m {code}");

                Task.Run(() =>
                {
                    try
                    {
                        var res = App.Python.Call(new
                        {
                            cmd = "exec",
                            code = code
                        });

                        HandlePythonResponse(res);
                    }
                    catch (Exception ex)
                    {
                        AppendLog($"\x1b[31m{ex.Message}\x1b[0m");
                    }
                });

                e.Handled = true;
                break;
            }
            
            case Key.Back:
            {
                var caret = CommandInput.CaretIndex;
                var text = CommandInput.Text;

                if (caret > 0 && caret < text.Length)
                {
                    var prev = text[caret - 1].ToString();
                    var next = text[caret].ToString();

                    if (_autoPairs.TryGetValue(prev, out var expectedClose) && next == expectedClose)
                    {
                        // Delete both the opening and closing char at once
                        CommandInput.Text = text.Remove(caret - 1, 2);
                        CommandInput.CaretIndex = caret - 1;
                        e.Handled = true;
                    }
                }
                break;
            }
        }
    }
    
    private void CommandInput_PreviewTextInput(object sender, TextCompositionEventArgs e)
    {
        if (!_autoPairs.TryGetValue(e.Text, out var closing))
            return;

        var caret = CommandInput.CaretIndex;
        var text = CommandInput.Text;

        // For closing chars that are same as opening (quotes/backtick),
        // if the next char is already the closing char, just skip over it
        if (e.Text == closing && caret < text.Length && text[caret].ToString() == closing)
        {
            CommandInput.CaretIndex = caret + 1;
            e.Handled = true;
            return;
        }

        // Insert both chars and place cursor between them
        var newText = text.Insert(caret, e.Text + closing);
        CommandInput.Text = newText;
        CommandInput.CaretIndex = caret + 1;
        e.Handled = true;
    }
    
    private void CommandInput_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        var text = CommandInput.Text;
        var caret = CommandInput.CaretIndex;

        if (text.Length == 0) return;

        // Clamp caret to valid range
        var pos = Math.Min(caret, text.Length - 1);

        // If we clicked past the end, select nothing
        if (caret >= text.Length && text.Length > 0)
            pos = text.Length - 1;

        // Expand left
        var start = pos;
        while (start > 0 && IsPythonWordChar(text[start - 1]))
            start--;

        // Expand right
        var end = pos;
        while (end < text.Length && IsPythonWordChar(text[end]))
            end++;

        if (end > start)
        {
            CommandInput.Select(start, end - start);
            e.Handled = true;
        }
    }

    private static bool IsPythonWordChar(char c) =>
        char.IsLetterOrDigit(c) || c == '_';

    // ===============================
    // Actions
    // ===============================
    private async void Download_Click(object sender, RoutedEventArgs e)
    {
        SetBusy(true);

        try
        {
            // Get current settings from SettingsView
            // Assuming you have a reference to your SettingsView control named SettingsViewControl
            var settings = SettingsViewControl.CurrentSettings;

            // Extract event_key from settings (assuming it exists)
            var eventKey = settings.TryGetValue("event_key", out var key)
                ? key?.ToString() ?? ""
                : "";

            await Task.Run(() =>
            {
                try
                {
                    var res = App.Python.Call(new
                    {
                        cmd = "download_data",
                        event_key = eventKey
                    });

                    HandlePythonResponse(res);
                }
                catch (InvalidOperationException ex)
                {
                    // Python returned an error
                    AppendLog($"\x1b[31m{ex.Message}\x1b[0m");
                }
            });
        }
        catch (Exception ex)
        {
            AppendLog($"\x1b[31mError: {ex.Message}\x1b[0m");
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void Run_Click(object sender, RoutedEventArgs e)
    {
        SetBusy(true);

        try
        {
            // Get current settings from SettingsView
            var settings = SettingsViewControl.CurrentSettings;

            // Extract event_key and stop_on_warning from settings
            var eventKey = settings.TryGetValue("event_key", out var key)
                ? key?.ToString() ?? ""
                : "";

            var stopOnWarning = settings.TryGetValue("stop_on_warning", out var stop)
                                && stop is bool stopBool && stopBool;

            await Task.Run(() =>
            {
                try
                {
                    var res = App.Python.Call(new
                    {
                        cmd = "run_calculation",
                        setting = new
                        {
                            event_key = eventKey,
                            stop_on_warning = stopOnWarning
                        }
                    });

                    HandlePythonResponse(res);
                }
                catch (InvalidOperationException ex)
                {
                    // Python returned an error
                    AppendLog($"\x1b[31m{ex.Message}\x1b[0m");
                }
            });
        }
        catch (Exception ex)
        {
            AppendLog($"\x1b[31mError: {ex.Message}\x1b[0m");
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void Upload_Click(object sender, RoutedEventArgs e)
    {
        SetBusy(true);

        try
        {
            // Get current settings from SettingsView
            var settings = SettingsViewControl.CurrentSettings;

            // Extract event_key from settings
            var eventKey = settings.TryGetValue("event_key", out var key)
                ? key?.ToString() ?? ""
                : "";

            if (string.IsNullOrWhiteSpace(eventKey))
            {
                AppendLog("\x1b[31mError: Event key is required for upload\x1b[0m");
                return;
            }

            await Task.Run(() =>
            {
                try
                {
                    var res = App.Python.Call(new
                    {
                        cmd = "upload_data",
                        event_key = eventKey
                    });

                    HandlePythonResponse(res);
                }
                catch (InvalidOperationException ex)
                {
                    // Python returned an error
                    AppendLog($"\x1b[31m{ex.Message}\x1b[0m");
                }
            });
        }
        catch (Exception ex)
        {
            AppendLog($"\x1b[31mError: {ex.Message}\x1b[0m");
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void Exit_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    // ===============================
    // Python response handling
    // ===============================
    private void HandlePythonResponse(JsonElement res)
    {
        // Logs are now handled via OnPythonLog event (real-time streaming)
        // We only need to handle the single 'log' field for backward compatibility
        // and final result data

        // Handle single log message (backward compatibility for ping, etc.)
        if (res.TryGetProperty("log", out var log) &&
            log.ValueKind == JsonValueKind.String)
        {
            var logText = log.GetString();
            if (!string.IsNullOrEmpty(logText))
            {
                AppendLog(logText);
            }
        }

        // Handle errors
        if (res.TryGetProperty("error", out var err) &&
            err.ValueKind == JsonValueKind.String)
        {
            AppendLog("\x1b[31m" + err.GetString() + "\x1b[0m");
        }
    }

    // ===============================
    // Helpers
    // ===============================
    private void SetBusy(bool busy)
    {
        Dispatcher.Invoke(() =>
        {
            _isBusy = busy;

            RunBtn.IsEnabled = !busy;
            UploadBtn.IsEnabled = !busy;
            DownloadBtn.IsEnabled = !busy;
            CommandInput.IsEnabled = !busy;

            if (busy)
            {
                Keyboard.ClearFocus();
            }
        });
    }

    private void AppendLog(string text)
    {
        Dispatcher.Invoke(() =>
        {
            _console.Write(text + "\n");
            RenderConsole();
        });
    }

    private void RenderConsole()
    {
        var doc = new FlowDocument();
        var para = new Paragraph
        {
            FontFamily = new FontFamily("Consolas"),
            FontSize = 13
        };

        var buffer = _console.Buffer;
        var defaultBg = buffer.DefaultBackground;

        for (int r = 0; r < buffer.Rows; r++)
        {
            var row = buffer.Cells[r];

            // Find last non-space character to trim trailing whitespace
            int lastNonSpace = -1;
            for (int c = buffer.Columns - 1; c >= 0; c--)
            {
                if (row[c].Char != ' ' || row[c].Background != defaultBg)
                {
                    lastNonSpace = c;
                    break;
                }
            }

            if (lastNonSpace < 0)
            {
                // Empty row — just add line break
                para.Inlines.Add(new LineBreak());
                continue;
            }

            Color? lastFg = null;
            Color? lastBg = null;
            CellAttributes lastAttr = (CellAttributes)(-1);
            var sb = new StringBuilder();

            for (int c = 0; c <= lastNonSpace; c++)
            {
                var cell = row[c];

                var fg = cell.Foreground;
                var bg = cell.Background;
                var attr = cell.Attributes;

                // Handle inverse attribute: swap fg/bg
                if (attr.HasFlag(CellAttributes.Inverse))
                    (fg, bg) = (bg, fg);

                // Hidden: make foreground same as background
                if (attr.HasFlag(CellAttributes.Hidden))
                    fg = bg;

                bool changed = fg != lastFg || bg != lastBg || attr != lastAttr;

                if (changed && sb.Length > 0)
                {
                    FlushRun(para, sb.ToString(), lastFg!.Value, lastBg!.Value, lastAttr, defaultBg);
                    sb.Clear();
                }

                lastFg = fg;
                lastBg = bg;
                lastAttr = attr;
                sb.Append(cell.Char);
            }

            if (sb.Length > 0)
            {
                FlushRun(para, sb.ToString(), lastFg!.Value, lastBg!.Value, lastAttr, defaultBg);
            }

            para.Inlines.Add(new LineBreak());
        }

        doc.Blocks.Add(para);
        LogOutput.Document = doc;
        LogOutput.ScrollToEnd();
    }

    private static void FlushRun(Paragraph para, string text, Color fg, Color bg, CellAttributes attr, Color defaultBg)
    {
        var run = new Run(text)
        {
            Foreground = new SolidColorBrush(fg)
        };

        // Background (only set if non-default to keep transparent look)
        if (bg != defaultBg)
        {
            run.Background = new SolidColorBrush(bg);
        }

        // Bold
        if (attr.HasFlag(CellAttributes.Bold))
        {
            run.FontWeight = FontWeights.Bold;
        }

        // Dim — reduce foreground opacity
        if (attr.HasFlag(CellAttributes.Dim))
        {
            var dimColor = Color.FromArgb(128, fg.R, fg.G, fg.B);
            run.Foreground = new SolidColorBrush(dimColor);
        }

        // Italic
        if (attr.HasFlag(CellAttributes.Italic))
        {
            run.FontStyle = FontStyles.Italic;
        }

        // Underline
        if (attr.HasFlag(CellAttributes.Underline))
        {
            run.TextDecorations = TextDecorations.Underline;
        }

        // Strikethrough
        if (attr.HasFlag(CellAttributes.Strikethrough))
        {
            run.TextDecorations = attr.HasFlag(CellAttributes.Underline)
                ? new TextDecorationCollection(TextDecorations.Underline.Concat(TextDecorations.Strikethrough))
                : TextDecorations.Strikethrough;
        }

        para.Inlines.Add(run);
    }

    // Optional: React to settings changes
    private void OnSettingsChanged(object? sender, EventArgs e)
    {
        AppendLog("Settings updated");
    }
    
    // TextChanged handler — triggers completion
    private void CommandInput_TextChanged(object sender, TextChangedEventArgs e)
    {
        var text = CommandInput.Text;
        if (text.Length > 0 && !text.EndsWith(' '))
            _ = TriggerCompletionAsync();
        else
            CompletionPopup.IsOpen = false;
    }

    private async Task TriggerCompletionAsync()
    {
        _completionCts?.Cancel();
        _completionCts = new CancellationTokenSource();
        var cts = _completionCts;

        var code = CommandInput.Text;
        var caretIndex = CommandInput.CaretIndex;

        try { await Task.Delay(120, cts.Token); }
        catch (TaskCanceledException) { return; }
        if (cts.IsCancellationRequested) return;

        var lines = code[..caretIndex].Split('\n');
        var line = lines.Length;
        var column = lines[^1].Length;

        var completions = await Task.Run(() =>
        {
            try
            {
                var res = App.Python.Call(new { cmd = "complete", code, line, column });
                if (res.TryGetProperty("completions", out var arr))
                    return arr.EnumerateArray()
                        .Select(c => new CompletionItem(
                            c.GetProperty("name").GetString()!,
                            c.GetProperty("complete").GetString()!,
                            c.GetProperty("type").GetString()!))
                        .ToList();
            }
            catch { }
            return new List<CompletionItem>();
        });

        if (!cts.IsCancellationRequested)
            ShowCompletionPopup(completions);
    }

    private void ShowCompletionPopup(List<CompletionItem> completions)
    {
        Dispatcher.Invoke(() =>
        {
            if (completions.Count == 0) { CompletionPopup.IsOpen = false; return; }
            CompletionList.ItemsSource = completions;
            CompletionList.SelectedIndex = 0;
            CompletionPopup.IsOpen = true;
        });
    }

    private void ApplyCompletion(CompletionItem item)
    {
        var caret = CommandInput.CaretIndex;
        CommandInput.Text = CommandInput.Text.Insert(caret, item.Complete);
        CommandInput.CaretIndex = caret + item.Complete.Length;
        CompletionPopup.IsOpen = false;
        CommandInput.Focus();
    }

    private void CompletionList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (CompletionList.SelectedItem is CompletionItem item)
            ApplyCompletion(item);
    }

    private void CompletionList_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key is Key.Enter or Key.Tab)
        {
            if (CompletionList.SelectedItem is CompletionItem item)
                ApplyCompletion(item);
            e.Handled = true;
        }
        else if (e.Key == Key.Escape)
        {
            CompletionPopup.IsOpen = false;
            CommandInput.Focus();
            e.Handled = true;
        }
    }
}