using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;

public sealed class PythonService : IDisposable
{
    private readonly Process _process;
    private readonly StreamWriter _stdin;
    private readonly StreamReader _stdout;
    private readonly object _lock = new();

    // Event raised when Python writes to stderr (real-time logging)
    public event Action<string>? LogReceived;

    public PythonService(string pythonExe, string serviceScript)
    {
        var psi = new ProcessStartInfo
        {
            FileName = pythonExe,
            Arguments = $"-u \"{serviceScript}\"", // -u for unbuffered output
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };

        // Set PYTHONUNBUFFERED environment variable as well
        psi.EnvironmentVariables["PYTHONUNBUFFERED"] = "1";

        _process = Process.Start(psi)
                   ?? throw new InvalidOperationException("Failed to start Python process");

        _stdin = _process.StandardInput;
        _stdout = _process.StandardOutput;

        // Capture stderr asynchronously and raise events for real-time logging
        _process.ErrorDataReceived += (_, e) =>
        {
            if (!string.IsNullOrEmpty(e.Data))
            {
                // Raise event for UI to display in real-time
                LogReceived?.Invoke(e.Data);
            }
        };
        _process.BeginErrorReadLine();
    }

    public JsonElement Call(object request)
    {
        lock (_lock)
        {
            var json = JsonSerializer.Serialize(request);

            _stdin.WriteLine(json);
            _stdin.Flush();

            // Read the response from stdout (which contains only JSON responses)
            var line = _stdout.ReadLine();
            if (line is null)
                throw new InvalidOperationException("Python process exited unexpectedly.");

            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;

            // Don't throw on success=false - let caller handle errors
            return root.Clone();
        }
    }

    public void Dispose()
    {
        try
        {
            if (!_process.HasExited)
                _process.Kill(entireProcessTree: true);
        }
        catch
        {
        }
    }
}