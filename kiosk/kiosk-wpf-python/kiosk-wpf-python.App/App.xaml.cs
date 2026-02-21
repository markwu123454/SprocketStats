using System.Diagnostics;
using System.IO;
using System.Windows;

namespace kiosk_wpf_python.App;

public partial class App : Application
{
    public static PythonService Python { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        try
        {
            var baseDir = AppContext.BaseDirectory;
            var pythonExe = Path.Combine(baseDir, "python", ".venv", "Scripts", "python.exe");
            var servicePy = Path.Combine(baseDir, "python", "service.py");

            if (!File.Exists(pythonExe))
                throw new FileNotFoundException("python.exe not found", pythonExe);

            if (!File.Exists(servicePy))
                throw new FileNotFoundException("service.py not found", servicePy);

            Python = new PythonService(pythonExe, servicePy);

            // Correct smoke test
            var result = Python.Call(new { cmd = "ping" });

            Debug.WriteLine("Python ready: " + result);

            new MainWindow().Show();
        }
        catch (Exception ex)
        {
            File.WriteAllText(
                Path.Combine(AppContext.BaseDirectory, "python_error.txt"),
                ex.ToString());

            MessageBox.Show(
                ex.ToString(),
                "Startup Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);

            Shutdown();
        }
    }


    protected override void OnExit(ExitEventArgs e)
    {
        Python?.Dispose();
        base.OnExit(e);
    }
}