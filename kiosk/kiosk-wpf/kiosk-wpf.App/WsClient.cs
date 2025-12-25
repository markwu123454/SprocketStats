using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace kiosk_wpf.App;

public sealed class WsClient : IDisposable
{
    private readonly CancellationTokenSource _cts = new();

    private readonly SynchronizationContext? _uiContext =
        SynchronizationContext.Current;

    private readonly ClientWebSocket _ws = new();

    public void Dispose()
    {
        _cts.Cancel();
        _ws.Dispose();
        _cts.Dispose();
    }

    public event Action<string>? LogReceived;
    public event Action<bool>? BusyChanged;

    public async Task ConnectAsync(string uri)
    {
        if (_ws.State == WebSocketState.Open)
            return;

        await _ws.ConnectAsync(new Uri(uri), _cts.Token);
        _ = Task.Run(ReceiveLoop);
    }

    public async Task SendAsync(object payload, CancellationToken ct = default)
    {
        if (_ws.State != WebSocketState.Open)
            throw new InvalidOperationException("WebSocket is not connected.");

        var json = JsonSerializer.Serialize(payload);
        var bytes = Encoding.UTF8.GetBytes(json);

        await _ws.SendAsync(
            new ArraySegment<byte>(bytes),
            WebSocketMessageType.Text,
            true,
            ct);
    }

    private async Task ReceiveLoop()
    {
        var buffer = new byte[8192];

        try
        {
            while (_ws.State == WebSocketState.Open && !_cts.IsCancellationRequested)
            {
                using var ms = new MemoryStream();
                WebSocketReceiveResult result;

                do
                {
                    result = await _ws.ReceiveAsync(buffer, _cts.Token);

                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await _ws.CloseAsync(
                            WebSocketCloseStatus.NormalClosure,
                            "Server closed connection",
                            CancellationToken.None);
                        return;
                    }

                    ms.Write(buffer, 0, result.Count);
                } while (!result.EndOfMessage);

                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var json = Encoding.UTF8.GetString(ms.ToArray());
                    HandleMessage(json);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown
        }
        catch (Exception ex)
        {
            Raise(() => LogReceived?.Invoke($"WebSocket error: {ex.Message}"));
        }
    }

    private void HandleMessage(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        if (!root.TryGetProperty("type", out var typeProp))
            return;

        switch (typeProp.GetString())
        {
            case "log":
                if (root.TryGetProperty("text", out var textProp))
                {
                    var text = textProp.GetString() ?? string.Empty; // ✅ extracted
                    Raise(() => LogReceived?.Invoke(text));
                }

                break;

            case "state":
                if (root.TryGetProperty("busy", out var busyProp))
                {
                    var busy = busyProp.GetBoolean(); // ✅ extracted
                    Raise(() => BusyChanged?.Invoke(busy));
                }

                break;
        }
    }

    public void SetBusy(bool busy)
    {
        Raise(() => BusyChanged?.Invoke(busy));
    }

    private void Raise(Action action)
    {
        if (_uiContext != null)
            _uiContext.Post(_ => action(), null);
        else
            action();
    }

    public async Task DisconnectAsync()
    {
        if (_ws.State == WebSocketState.Open)
        {
            _cts.Cancel();

            await _ws.CloseAsync(
                WebSocketCloseStatus.NormalClosure,
                "Client disconnect",
                CancellationToken.None);
        }
    }
}