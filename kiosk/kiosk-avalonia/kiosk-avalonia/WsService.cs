using System;
using System.Threading.Tasks;

namespace kiosk_avalonia;

public sealed class WsService
{
    public WsClient Client { get; } = new();

    public async Task<bool> StartAsync()
    {
        const int maxAttempts = 30;
        const int delayMs = 500;

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
            try
            {
                await Client.ConnectAsync("ws://127.0.0.1:8000/ws");
                Console.WriteLine("WS connected");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine(
                    $"WS attempt {attempt} failed: {ex.GetType().Name}: {ex.Message}"
                );
                await Task.Delay(delayMs);
            }

        // Failed after retries
        return false;
    }
}