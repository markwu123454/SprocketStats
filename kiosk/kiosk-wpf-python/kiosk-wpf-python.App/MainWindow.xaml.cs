using System.Text;
using System.Text.Json;
using System.Windows;
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

    public MainWindow()
    {
        InitializeComponent();
        
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
        }
    }

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
                        Foreground = new SolidColorBrush(lastColor!.Value)
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

    // Optional: React to settings changes
    private void OnSettingsChanged(object? sender, EventArgs e)
    {
        AppendLog("Settings updated");
    }
}