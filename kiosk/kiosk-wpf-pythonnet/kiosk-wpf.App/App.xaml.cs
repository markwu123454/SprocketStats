using System.Diagnostics;
using System.IO;
using System.Windows;
using Python.Runtime;

namespace kiosk_wpf.App;

public partial class App
{
    // App-level services
    public static PythonService Python { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        try
        {
            InitializePython();
            Python = new PythonService();

            Python.RegisterLogger(msg => { Debug.WriteLine("[PY] " + msg); });

            // Only show main window if Python initialized successfully
            new MainWindow().Show();
        }
        catch (Exception ex)
        {
            var errorMsg = $"Failed to initialize Python:\n{ex}";

            // Log to file for debugging
            File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "python_error.txt"), errorMsg);

            MessageBox.Show(
                errorMsg,
                "Startup Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);

            Shutdown();
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        try
        {
            PythonEngine.Shutdown();
        }
        catch
        {
            // swallow shutdown issues
        }

        base.OnExit(e);
    }

    private static void InitializePython()
    {
        var pythonRoot = Path.Combine(AppContext.BaseDirectory, "python");
        var pythonDll = Path.Combine(pythonRoot, "python311.dll");

        if (!File.Exists(pythonDll))
            throw new FileNotFoundException("python311.dll not found", pythonDll);

        // Hard-pin DLL search path
        Environment.SetEnvironmentVariable(
            "PATH",
            string.Join(";", new[]
            {
                pythonRoot,
                Path.Combine(pythonRoot, "DLLs"),
                Environment.GetEnvironmentVariable("PATH")
            })
        );

        Runtime.PythonDLL = pythonDll;

        PythonEngine.Initialize();
        PythonEngine.BeginAllowThreads();
    }
}