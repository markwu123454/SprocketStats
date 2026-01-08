using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Avalonia.Threading;

namespace kiosk_avalonia;

public sealed class WsClient : IDisposable
{
    private CancellationTokenSource _cts = new();
    private ClientWebSocket _ws = new();

    public event Action<string>? LogReceived;
    public event Action<bool>? BusyChanged;
    
    public async Task ConnectAsync(string uri)
    {
        if (_ws.State == WebSocketState.Open)
            return;

        try
        {
            await _ws.ConnectAsync(new Uri(uri), _cts.Token);
            _ = Task.Run(ReceiveLoop);
        }
        catch
        {
            Reset();
            throw;
        }
    }

    private void Reset()
    {
        try { _ws.Dispose(); } catch { }
        try { _cts.Dispose(); } catch { }

        _cts = new CancellationTokenSource();
        _ws = new ClientWebSocket();
    }

    public void Dispose()
    {
        Reset();
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
            // normal shutdown
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
        // Console.WriteLine(doc.RootElement.ToString());
        switch (typeProp.GetString())
        {
            case "log":
                if (root.TryGetProperty("text", out var textProp))
                {
                    var text = textProp.GetString() ?? string.Empty;
                    Raise(() => LogReceived?.Invoke(text));
                }

                break;

            case "state":
                if (root.TryGetProperty("busy", out var busyProp))
                {
                    var busy = busyProp.GetBoolean();
                    Raise(() => BusyChanged?.Invoke(busy));
                }

                break;
        }
    }

    public void SetBusy(bool busy)
    {
        Raise(() => BusyChanged?.Invoke(busy));
    }

    private static void Raise(Action action)
    {
        if (Dispatcher.UIThread.CheckAccess())
            action();
        else
            Dispatcher.UIThread.Post(action);
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