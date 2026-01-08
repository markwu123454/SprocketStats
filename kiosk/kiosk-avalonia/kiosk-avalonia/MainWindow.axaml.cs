using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Threading;

namespace kiosk_avalonia;

public partial class MainWindow : Window
{
    private const string AppVersion = "v26.0.1";

    private readonly List<string> _commandHistory = new();
    private readonly AnsiConsole _console = new();

    private string? _currentInputBuffer = string.Empty;
    private int _historyIndex = -1;

    public MainWindow()
    {
        InitializeComponent();

        App.Ws.Client.LogReceived += AppendLog;
        App.Ws.Client.BusyChanged += SetBusy;

        Opened += OnOpened;
    }

    private async void OnOpened(object? sender, EventArgs e)
    {
        try
        {
            var app = (App)Application.Current!;
            app.StartBackendSafe();

            AppendLog(AppVersion);
            await StartWsAsync();
        }
        catch (Exception ex)
        {
            AppendLog("Backend failed to start:");
            AppendLog(ex.Message);
        }
    }

    private async Task StartWsAsync()
    {
        SetBusy(true);

        var ok = await App.Ws.StartAsync();

        SetBusy(false);

        if (!ok)
            AppendLog("Backend not reachable.");
    }

    // =============================
    // Logging
    // =============================

    private void AppendLog(string text)
    {
        Dispatcher.UIThread.Post(() =>
        {
            var wasAtBottom = IsScrolledToBottom();

            _console.Write(text + "\n");
            LogLines.ItemsSource = _console.Lines;

            if (wasAtBottom)
            {
                LogScrollViewer.ScrollToEnd();
            }
        });
    }

    private bool IsScrolledToBottom()
    {
        if (LogScrollViewer == null)
            return true;

        const double epsilon = 2.0;

        return LogScrollViewer.Offset.Y
               >= LogScrollViewer.Extent.Height
               - LogScrollViewer.Viewport.Height
               - epsilon;
    }


    // =============================
    // Busy state
    // =============================

    private void SetBusy(bool busy)
    {
        Dispatcher.UIThread.Post(() =>
        {
            DownloadBtn.IsEnabled = !busy;
            RunBtn.IsEnabled = !busy;
            UploadBtn.IsEnabled = !busy;
        });
    }

    // =============================
    // Command input
    // =============================

    private void CommandInput_KeyDown(object? sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Enter:
                ExecuteCommand();
                e.Handled = true;
                break;

            case Key.Up:
                NavigateHistory(true);
                e.Handled = true;
                break;

            case Key.Down:
                NavigateHistory(false);
                e.Handled = true;
                break;
        }
    }

    private void ExecuteCommand()
    {
        var code = CommandInput.Text?.Trim();
        if (string.IsNullOrWhiteSpace(code))
            return;

        _commandHistory.Add(code);
        _historyIndex = _commandHistory.Count;
        _currentInputBuffer = string.Empty;

        CommandInput.Clear();

        _ = App.Ws.Client.SendAsync(new
        {
            type = "python",
            code
        });
    }

    private void NavigateHistory(bool up)
    {
        if (_commandHistory.Count == 0)
            return;

        if (_historyIndex == _commandHistory.Count)
            _currentInputBuffer = CommandInput.Text;

        _historyIndex = up
            ? Math.Max(0, _historyIndex - 1)
            : Math.Min(_commandHistory.Count, _historyIndex + 1);

        CommandInput.Text =
            _historyIndex >= 0 && _historyIndex < _commandHistory.Count
                ? _commandHistory[_historyIndex]
                : _currentInputBuffer;

        if (CommandInput.Text != null)
            CommandInput.CaretIndex = CommandInput.Text.Length;
    }

    // =============================
    // Buttons
    // =============================

    private void Exit_Click(object? sender, RoutedEventArgs e)
    {
        Close();
    }

    private void Download_Click(object? sender, RoutedEventArgs e)
    {
        _ = App.Ws.Client.SendAsync(new { type = "command", name = "download" });
    }

    private void Run_Click(object? sender, RoutedEventArgs e)
    {
        _ = App.Ws.Client.SendAsync(new { type = "command", name = "run" });
    }

    private void Upload_Click(object? sender, RoutedEventArgs e)
    {
        _ = App.Ws.Client.SendAsync(new { type = "command", name = "upload" });
    }
}
