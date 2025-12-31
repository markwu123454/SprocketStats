using System.Windows;

namespace kiosk_wpf.App;

public sealed class WsService
{
    public WsClient Client { get; } = new();

    public async Task StartAsync()
    {
        const int maxAttempts = 30;
        const int delayMs = 250;

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
            try
            {
                await Client.ConnectAsync("ws://127.0.0.1:8000/ws");
                return;
            }
            catch
            {
                await Task.Delay(delayMs);
            }

        Application.Current.Dispatcher.Invoke(
            Application.Current.Shutdown);
    }
}