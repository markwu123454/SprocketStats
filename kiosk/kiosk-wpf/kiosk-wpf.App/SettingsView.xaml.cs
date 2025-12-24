using System.Windows;
using System.Windows.Controls;

namespace kiosk_wpf.App;

public partial class SettingsView
{
    public SettingsView()
    {
        InitializeComponent();

        var ws = App.Ws.Client;

        ws.BusyChanged += OnBusyChanged;
        ws.LogReceived += OnLog;

        Unloaded += OnUnloaded;
    }

    private void OnSettingChanged(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded)
            return;
        SendSettings();
    }

    private void SendSettings()
    {
        var ws = App.Ws.Client;

        var payload = new
        {
            type = "set_settings",
            payload = new
            {
                event_key = EventKeyBox.Text.Trim(),
                verbose = VerboseLogging.IsChecked == true,
                option_b = (OptionBCombo.SelectedItem as ComboBoxItem)?.Content?.ToString()
            }
        };

        _ = ws.SendAsync(payload);
    }


    private void OnBusyChanged(bool busy)
    {
        Dispatcher.Invoke(() => { IsEnabled = !busy; });
    }

    private void OnLog(string text)
    {
        if (text.Contains("settings:locked")) Dispatcher.Invoke(() => IsEnabled = false);
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        var ws = App.Ws.Client;

        ws.BusyChanged -= OnBusyChanged;
        ws.LogReceived -= OnLog;
    }
}