using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;

namespace kiosk_wpf.App;

public partial class MainWindow
{
    private readonly AnsiConsole _console = new();
    
    private bool _isBusy;
    
    private readonly List<string> _commandHistory = new();
    private int _historyIndex = -1;


    public MainWindow()
    {
        InitializeComponent();
        
        App.Python.RegisterLogger(AppendLog);
        App.Python.RegisterSetBusy(SetBusyFromPython);
        
        ContentRendered += MainWindow_ContentRendered;
        
        // Subscribe to settings changes (optional - if you want to react to changes)
        // Assuming you have a SettingsView instance accessible, e.g., SettingsViewControl
        // SettingsViewControl.SettingsChanged += OnSettingsChanged;
    }

    // ===============================
    // Command input (placeholder)
    // ===============================

    private async void MainWindow_ContentRendered(object sender, EventArgs e)
    {
        await Task.Run(() => App.Python.ExecuteCommand("python_init()"));
    }


    private void CommandInput_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Up:
            {
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

            case Key.Enter:
            {
                var command = CommandInput.Text.Trim();
                CommandInput.Clear();

                if (string.IsNullOrWhiteSpace(command))
                    return;

                if (_commandHistory.Count == 0 || _commandHistory[^1] != command)
                    _commandHistory.Add(command);

                _historyIndex = -1;

                try
                {
                    AppendLog($"\x1b[32m>>>\x1b[0m {command}");
                    Task.Run(() => App.Python.ExecuteCommand(command));
                }
                catch (Exception ex)
                {
                    AppendLog($"Error executing command: {ex.Message}");
                }

                e.Handled = true;
                break;
            }
        }
    }

    // ===============================
    // Actions
    // ===============================

    private async void Download_Click(object sender, RoutedEventArgs e)
    {
        // Get current settings from SettingsView
        // Assuming you have a reference to your SettingsView control named SettingsViewControl
        var settings = SettingsViewControl.CurrentSettings;
        
        // Extract event_key from settings (assuming it exists)
        var eventKey = settings.TryGetValue("event_key", out var key) 
            ? key?.ToString() ?? "" 
            : "";

        await Task.Run(() => App.Python.ExecuteCommand($"asyncio.run(download_data('{eventKey}'))"));
    }

    private async void Run_Click(object sender, RoutedEventArgs e)
    {
        var settings = SettingsViewControl.CurrentSettings;
    
        // Serialize dictionary to JSON string
        var settingsJson = JsonSerializer.Serialize(settings);
    
        // Escape the JSON string for Python
        var escapedJson = settingsJson.Replace("\\", "\\\\").Replace("'", "\\'");
    
        await Task.Run(() => App.Python.ExecuteCommand($"run_calculation('{escapedJson}')"));
    }

    private async void Upload_Click(object sender, RoutedEventArgs e)
    {
        // Get current settings from SettingsView
        // Assuming you have a reference to your SettingsView control named SettingsViewControl
        var settings = SettingsViewControl.CurrentSettings;
        
        // Extract event_key from settings (assuming it exists)
        var eventKey = settings.TryGetValue("event_key", out var key) 
            ? key?.ToString() ?? "" 
            : "";

        await Task.Run(() => App.Python.ExecuteCommand($"asyncio.run(upload_data('{eventKey}'))"));
    }

    private void Exit_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    // ===============================
    // Helpers
    // ===============================

    private void SetBusy(bool busy)
    {
        Dispatcher.Invoke(() =>
        {
            RunBtn.IsEnabled = !busy;
            UploadBtn.IsEnabled = !busy;
        });

        App.Python.SetBusy(busy);
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

        for (int r = 0; r < buffer.Rows; r++)
        {
            var row = buffer.Cells[r];

            Color? lastColor = null;
            var sb = new StringBuilder();

            for (int c = 0; c < buffer.Columns; c++)
            {
                var cell = row[c];

                if (lastColor != cell.Foreground && sb.Length > 0)
                {
                    para.Inlines.Add(new Run(sb.ToString())
                    {
                        Foreground = new SolidColorBrush(lastColor.Value)
                    });
                    sb.Clear();
                }

                lastColor = cell.Foreground;
                sb.Append(cell.Char);
            }

            if (sb.Length > 0)
            {
                para.Inlines.Add(new Run(sb.ToString())
                {
                    Foreground = new SolidColorBrush(lastColor!.Value)
                });
            }

            para.Inlines.Add(new LineBreak());
        }

        doc.Blocks.Add(para);
        LogOutput.Document = doc;
        LogOutput.ScrollToEnd();
    }
    
    private void SetBusyFromPython(bool busy)
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
    
    // Optional: React to settings changes
    private void OnSettingsChanged(object? sender, EventArgs e)
    {
        // You can add logic here if you need to react to settings changes
        AppendLog("Settings updated");
    }
}