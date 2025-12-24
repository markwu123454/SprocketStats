using System.Diagnostics;
using System.IO;
using System.Windows;

namespace kiosk_wpf.App;

public partial class App
{
    private const int RestartDelayMs = 2000;
    // =============================
    // Configuration
    // =============================

    private static readonly string LogFile =
        Path.Combine(AppContext.BaseDirectory, "fastapi.log");

    private readonly object _restartLock = new();

    // =============================
    // State
    // =============================

    private Process? _fastApiProcess;
    private bool _isShuttingDown;

    public static WsService Ws { get; } = new();

    // =============================
    // Logging
    // =============================

    private static void Log(string text)
    {
        try
        {
            File.AppendAllText(
                LogFile,
                $"[{DateTime.Now:HH:mm:ss}] {text}{Environment.NewLine}");
        }
        catch
        {
            // Never crash on logging failure
        }
    }

    // =============================
    // App lifecycle
    // =============================

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        StartFastApi();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _isShuttingDown = true;
        StopFastApi();
        base.OnExit(e);
    }

    // =============================
    // FastAPI supervision
    // =============================

    private void StartFastApi()
    {
        if (_isShuttingDown)
            return;

        var exeDir = AppContext.BaseDirectory;

        var kioskRoot = Path.GetFullPath(
            Path.Combine(exeDir, "..", "..", "..", "..", "..")
        );

        var fastApiDir = Path.Combine(kioskRoot, "kiosk-fastapi");

        Log($"FastAPI working directory: {fastApiDir}");

        var pythonExe = Path.Combine(
            fastApiDir,
            ".venv",
            "Scripts",
            "python.exe"
        );

        if (!File.Exists(pythonExe))
        {
            Log($"ERROR: Python not found at {pythonExe}");
            MessageBox.Show($"Python not found:\n{pythonExe}");
            return;
        }

        var psi = new ProcessStartInfo
        {
            FileName = pythonExe,
            Arguments = "-m uvicorn main:app --host 127.0.0.1 --port 8000",
            WorkingDirectory = fastApiDir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };

        try
        {
            _fastApiProcess = new Process
            {
                StartInfo = psi,
                EnableRaisingEvents = true
            };

            _fastApiProcess.Exited += (_, _) =>
            {
                Log("FastAPI process exited");

                if (_isShuttingDown)
                    return;

                RestartFastApiWithBackoff();
            };

            _fastApiProcess.OutputDataReceived += (_, e) =>
            {
                if (e.Data != null)
                    Log($"[FastAPI] {e.Data}");
            };

            _fastApiProcess.ErrorDataReceived += (_, e) =>
            {
                if (e.Data != null)
                    Log($"[FastAPI ERROR] {e.Data}");
            };

            _fastApiProcess.Start();
            _fastApiProcess.BeginOutputReadLine();
            _fastApiProcess.BeginErrorReadLine();

            Log("FastAPI process started");
        }
        catch (Exception ex)
        {
            Log($"ERROR starting FastAPI: {ex}");
        }
    }

    private static void KillProcessOnPort(int port)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c netstat -ano | findstr :{port}",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var proc = Process.Start(psi)!;
            var output = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit();

            foreach (var line in output.Split('\n'))
            {
                var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 5) continue;

                var pid = parts[^1];
                Process.Start("cmd.exe", $"/c taskkill /PID {pid} /F");
                Log($"Killed process {pid} on port {port}");
            }
        }
        catch (Exception ex)
        {
            Log($"Port cleanup failed: {ex}");
        }
    }


    private async void RestartFastApiWithBackoff()
    {
        lock (_restartLock)
        {
            if (_isShuttingDown)
                return;
        }

        Log($"Restarting FastAPI in {RestartDelayMs}ms...");
        await Task.Delay(RestartDelayMs);

        if (_isShuttingDown)
            return;

        try
        {
            KillProcessOnPort(8000);
            StartFastApi();
        }
        catch (Exception ex)
        {
            Log($"RESTART FAILED: {ex}");
        }
    }

    private void StopFastApi()
    {
        if (_fastApiProcess is { HasExited: false })
            try
            {
                Log("Stopping FastAPI");
                _fastApiProcess.Kill(true);
                _fastApiProcess.WaitForExit(2000);
            }
            catch (Exception ex)
            {
                Log($"ERROR stopping FastAPI: {ex}");
            }
            finally
            {
                _fastApiProcess.Dispose();
                _fastApiProcess = null;
            }
    }
}