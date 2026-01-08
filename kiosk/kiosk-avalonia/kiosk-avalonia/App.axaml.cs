using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avalonia.Media;

namespace kiosk_avalonia;

public class App : Application
{
    private Process? _backend;

    // App-level services
    public static WsService Ws { get; } = new();

    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            try
            {
                StartBackend();
            }
            catch (Exception ex)
            {
                ShowStartupError(desktop.MainWindow, ex.Message);
                return;
            }

            desktop.MainWindow = new MainWindow();
            desktop.Exit += (_, _) => StopBackend();
        }

        base.OnFrameworkInitializationCompleted();
    }

    // =============================
    // Backend
    // =============================

    private void StartBackend()
    {
        var info = ResolveBackend();

        var logDir = Path.Combine(info.WorkingDirectory, "logs");
        Directory.CreateDirectory(logDir);

        var stdoutLog = Path.Combine(logDir, "backend.stdout.log");
        var stderrLog = Path.Combine(logDir, "backend.stderr.log");

        var psi = new ProcessStartInfo
        {
            FileName = info.FileName,
            Arguments = info.Arguments,
            WorkingDirectory = info.WorkingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };

        _backend = new Process { StartInfo = psi };

        _backend.OutputDataReceived += (_, e) =>
        {
            if (e.Data != null)
                File.AppendAllText(stdoutLog, e.Data + Environment.NewLine);
        };

        _backend.ErrorDataReceived += (_, e) =>
        {
            if (e.Data != null)
                File.AppendAllText(stderrLog, e.Data + Environment.NewLine);
        };

        _backend.Start();
        _backend.BeginOutputReadLine();
        _backend.BeginErrorReadLine();
    }


    public void StartBackendSafe()
    {
        if (_backend != null)
            return;

        StartBackend();
    }


    private BackendLaunchInfo ResolveBackend()
    {
        if (DetectBackendMode() == BackendMode.ProdExe)
        {
            var exePath = EnsureFastApiExe();

            return new BackendLaunchInfo(
                exePath,
                "",
                Path.GetDirectoryName(exePath)!
            );
        }

        // -------- DEV MODE --------

        var exeDir = AppContext.BaseDirectory;

        var kioskRoot = Path.GetFullPath(
            Path.Combine(exeDir, "..", "..", "..", "..", "..", "kiosk-fastapi")
        );

        var fastApiDir = Path.Combine(kioskRoot);

        var pythonExe = Path.Combine(
            fastApiDir,
            ".venv",
            "Scripts",
            "python.exe"
        );

        if (!File.Exists(pythonExe))
            throw new FileNotFoundException("Python not found", pythonExe);

        return new BackendLaunchInfo(
            pythonExe,
            "-m uvicorn main:app --host 127.0.0.1 --port 8000",
            fastApiDir
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
            .GetManifestResourceStream("kiosk_avalonia.Resources.fastapi.exe");

        if (stream == null)
            throw new InvalidOperationException("Embedded fastapi.exe not found");

        using var file = File.Create(targetPath);
        stream.CopyTo(file);

        return targetPath;
    }

    private void StopBackend()
    {
        if (_backend == null || _backend.HasExited)
            return;

        try
        {
            _backend.Kill(true);
            _backend.WaitForExit(3000);
        }
        catch
        {
            // swallow shutdown exceptions
        }
        finally
        {
            _backend.Dispose();
            _backend = null;
        }
    }

    // =============================
    // UI helpers
    // =============================

    private static async void ShowStartupError(Window? owner, string message)
    {
        var dialog = new Window
        {
            Title = "Startup Error",
            Width = 420,
            Height = 160,
            Content = new TextBlock
            {
                Text = $"Failed to start backend:\n{message}",
                Margin = new Thickness(16),
                TextWrapping = TextWrapping.Wrap
            },
            WindowStartupLocation = WindowStartupLocation.CenterOwner
        };

        if (owner != null)
            await dialog.ShowDialog(owner);
        else
            dialog.Show();
    }

    private enum BackendMode
    {
        DevPython,
        ProdExe
    }

    // =============================
    // Models
    // =============================

    private sealed record BackendLaunchInfo(
        string FileName,
        string Arguments,
        string WorkingDirectory
    );
}