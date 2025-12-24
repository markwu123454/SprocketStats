using System.ComponentModel;
using System.Windows;
using System.Windows.Documents;
using System.Windows.Input;
using MediaColor = System.Windows.Media.Color;
using MediaBrush = System.Windows.Media.SolidColorBrush;


namespace kiosk_wpf.App;

public partial class MainWindow
{
    private static readonly Dictionary<MediaColor, MediaBrush> BrushCache = new();
    private readonly List<string> _commandHistory = new();
    private string _currentInputBuffer = string.Empty;
    private int _historyIndex = -1;


    public MainWindow()
    {
        InitializeComponent();

        PreviewKeyDown += OnPreviewKeyDown;
        Closing += OnClosing;

        Loaded += OnLoaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        OnLog("v26.0.1");
        _ = StartWsAsync();
    }

    private async Task StartWsAsync()
    {
        const int maxAttempts = 30; // ~7.5 seconds total
        const int delayMs = 250;

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
            try
            {
                await App.Ws.Client.ConnectAsync("ws://127.0.0.1:8000/ws");

                App.Ws.Client.LogReceived += OnLog;
                App.Ws.Client.BusyChanged += OnBusyChanged;

                return;
            }
            catch (Exception)
            {
                await Task.Delay(delayMs);
            }

        // Only reached if backend never came up
        Dispatcher.Invoke(() => { Application.Current.Shutdown(); });
    }

    private static MediaBrush GetBrush(MediaColor color)
    {
        if (!BrushCache.TryGetValue(color, out var brush))
        {
            brush = new MediaBrush(color);
            brush.Freeze(); // important for perf + thread safety
            BrushCache[color] = brush;
        }

        return brush;
    }

    private readonly AnsiConsole _console = new();

    private void OnLog(string text)
    {
        _console.Write(text);
        Render();
    }

    private void Render()
    {
        LogOutput.Document.Blocks.Clear();

        foreach (var line in _console.Lines)
        {
            var p = new Paragraph { Margin = new Thickness(0) };

            foreach (var span in line.Spans)
            {
                p.Inlines.Add(new Run(span.Text)
                {
                    Foreground = GetBrush(span.Color)
                });
            }

            LogOutput.Document.Blocks.Add(p);
        }

        LogOutput.ScrollToEnd();
    }


    private void OnBusyChanged(bool busy)
    {
        Dispatcher.Invoke(() =>
        {
            // optional: disable buttons while busy
            DownloadBtn.IsEnabled = !busy;
            RunBtn.IsEnabled = !busy;
            UploadBtn.IsEnabled = !busy;
        });
    }

    private void CommandInput_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            ExecuteCommand();
            e.Handled = true;
            return;
        }

        if (e.Key == Key.Up)
        {
            NavigateHistory(true);
            e.Handled = true;
            return;
        }

        if (e.Key == Key.Down)
        {
            NavigateHistory(false);
            e.Handled = true;
        }
    }

    private void ExecuteCommand()
    {
        var code = CommandInput.Text.Trim();
        if (string.IsNullOrWhiteSpace(code))
            return;

        _commandHistory.Add(code);
        _historyIndex = _commandHistory.Count;
        _currentInputBuffer = string.Empty;
        CommandInput.Clear();

        // fire-and-forget async WS send
        _ = App.Ws.Client.SendAsync(new
        {
            type = "python", code
        });
    }

    private void NavigateHistory(bool up)
    {
        if (_commandHistory.Count == 0)
            return;

        // save current input BEFORE moving into history
        if (_historyIndex == _commandHistory.Count) _currentInputBuffer = CommandInput.Text;

        if (up)
            _historyIndex = Math.Max(0, _historyIndex - 1);
        else
            _historyIndex = Math.Min(_commandHistory.Count, _historyIndex + 1);

        if (_historyIndex >= 0 && _historyIndex < _commandHistory.Count)
            CommandInput.Text = _commandHistory[_historyIndex];
        else
            // restore unsent input
            CommandInput.Text = _currentInputBuffer;

        CommandInput.CaretIndex = CommandInput.Text.Length;
    }

    // keyboard shortcuts live here
    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
#if DEBUG
        // DEV ESCAPE: ESC → exit app
        if (e.Key == Key.Escape)
        {
            Application.Current.Shutdown();
            return;
        }

        // DEV ALT: Ctrl+Alt+F12
        if (Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Alt) &&
            e.Key == Key.F12)
            Application.Current.Shutdown();
#endif

#if !DEBUG
        // PROD ADMIN: Ctrl+Shift+Esc → logout to login screen
        if (Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift) &&
            e.Key == Key.Escape)
        {
            LogoutUser();
        }
#endif
    }

    // block unsafe closes in PROD only
    private void OnClosing(object? sender, CancelEventArgs e)
    {
#if !DEBUG
        //e.Cancel = true; // prevent app from closing
        //RestartApp(); // keep shell alive
#endif
        // DEBUG: allow close normally
    }

    // Exit button → routes through OnClosing
    private void Exit_Click(object sender, RoutedEventArgs e)
    {
        Close(); // 🔑 DO NOT call Shutdown()
    }

    private void Download_Click(object sender, RoutedEventArgs e)
    {
        _ = App.Ws.Client.SendAsync(new
        {
            type = "command",
            name = "download"
        });
    }

    private void Run_Click(object sender, RoutedEventArgs e)
    {
        _ = App.Ws.Client.SendAsync(new
        {
            type = "command",
            name = "run"
        });
    }

    private void Upload_Click(object sender, RoutedEventArgs e)
    {
        _ = App.Ws.Client.SendAsync(new
        {
            type = "command",
            name = "upload"
        });
    }

    // shell actions
    private void LogoutUser()
    {
        ShellActions.Logout();
    }

    private void RestartApp()
    {
        ShellActions.RestartApp();
    }
}