using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows;

namespace kiosk_wpf.App;

public partial class App
{
    private Process? _backend;

    // App-level services
    public static WsService Ws { get; } = new();

    enum BackendMode
    {
        DevPython,
        ProdExe
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        try
        {
            StartBackend();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Failed to start backend:\n{ex.Message}",
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
            if (_backend is { HasExited: false })
                _backend.CloseMainWindow();
        }
        catch
        {
            
        }

        base.OnExit(e);
    }

    // =============================
    // Backend
    // =============================

    private void StartBackend()
    {
        var info = ResolveBackend();

        _backend = Process.Start(new ProcessStartInfo
        {
            FileName = info.FileName,
            Arguments = info.Arguments,
            WorkingDirectory = info.WorkingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true
        });
    }

    private BackendLaunchInfo ResolveBackend()
    {
        if (DetectBackendMode() == BackendMode.ProdExe)
        {
            var exePath = EnsureFastApiExe();

            return new BackendLaunchInfo(
                FileName: exePath,
                Arguments: "",
                WorkingDirectory: Path.GetDirectoryName(exePath)!
            );
        }

        // -------- DEV MODE --------

        var exeDir = AppContext.BaseDirectory;

        var kioskRoot = Path.GetFullPath(
            Path.Combine(exeDir, "..", "..", "..", "..", "..")
        );

        var fastApiDir = Path.Combine(kioskRoot, "kiosk-fastapi");

        var pythonExe = Path.Combine(
            fastApiDir,
            ".venv",
            "Scripts",
            "python.exe"
        );

        if (!File.Exists(pythonExe))
            throw new FileNotFoundException("Python not found", pythonExe);

        return new BackendLaunchInfo(
            FileName: pythonExe,
            Arguments: "-m uvicorn main:app --host 127.0.0.1 --port 8000",
            WorkingDirectory: fastApiDir
        );
    }

    private BackendMode DetectBackendMode()
    {
        return File.Exists(Path.Combine(AppContext.BaseDirectory, "fastapi.exe"))
            ? BackendMode.ProdExe
            : BackendMode.DevPython;
    }

    private static string EnsureFastApiExe()
    {
        var targetPath = Path.Combine(
            AppContext.BaseDirectory,
            "fastapi.exe"
        );

        if (File.Exists(targetPath))
            return targetPath;

        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("kiosk_wpf.Resources.fastapi.exe");

        if (stream == null)
            throw new InvalidOperationException("Embedded fastapi.exe not found");

        using var file = File.Create(targetPath);
        stream.CopyTo(file);

        return targetPath;
    }

    // =============================
    // Models
    // =============================

    sealed record BackendLaunchInfo(
        string FileName,
        string Arguments,
        string WorkingDirectory
    );
}
