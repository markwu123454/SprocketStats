using System.Diagnostics;

namespace kiosk_wpf.App;

public static class ShellActions
{
    public static void Logout()
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = "shutdown",
            Arguments = "/l",
            CreateNoWindow = true,
            UseShellExecute = false
        });
    }

    public static void RestartApp()
    {
        Process.Start(Environment.ProcessPath!);
        Environment.Exit(0);
    }
}