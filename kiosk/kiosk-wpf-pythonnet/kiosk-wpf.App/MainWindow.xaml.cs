using System.Text;
using System.Windows;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;

namespace kiosk_wpf.App;

public partial class MainWindow
{
    private readonly AnsiConsole _console = new();
    
    private bool _isBusy;

    public MainWindow()
    {
        InitializeComponent();
        
        App.Python.RegisterLogger(AppendLog);
        App.Python.RegisterSetBusy(SetBusyFromPython);
    }

    // ===============================
    // Command input (placeholder)
    // ===============================

    private void CommandInput_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter)
            return;

        var command = CommandInput.Text.Trim();
        CommandInput.Clear();

        if (string.IsNullOrWhiteSpace(command))
            return;

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
    }

    // ===============================
    // Actions
    // ===============================

    private void Download_Click(object sender, RoutedEventArgs e)
    {
        AppendLog("Download requested (placeholder)");
    }

    private async void Run_Click(object sender, RoutedEventArgs e)
    {
        SetBusy(true);

        try
        {
            var result = await Task.Run(() =>
                App.Python.RunCalculation("input.csv")
            );

            AppendLog(result);
        }
        catch (Exception ex)
        {
            AppendLog($"Error: {ex.Message}");
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void Upload_Click(object sender, RoutedEventArgs e)
    {
        AppendLog("Upload requested (placeholder)");
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
            Color? lastColor = null;
            var sb = new StringBuilder();

            for (int c = 0; c < buffer.Columns; c++)
            {
                var cell = buffer.Cells[r, c];

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
}