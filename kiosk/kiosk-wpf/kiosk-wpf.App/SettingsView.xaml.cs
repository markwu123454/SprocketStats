using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;

namespace kiosk_wpf.App;

public class SettingsUi
{
    public List<Section> Sections { get; set; } = [];
}

public class Section
{
    public string Title { get; set; } = "";
    public List<Setting> Settings { get; set; } = [];
}

public class Setting
{
    public string Type { get; set; } = "";
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public object? Default { get; set; }
    public List<string>? Options { get; set; }
}


public partial class SettingsView
{
    private readonly Dictionary<string, FrameworkElement> _controls = new();

    public SettingsView()
    {
        InitializeComponent();

        LoadSettingsUi();

        var ws = App.Ws.Client;
        ws.BusyChanged += OnBusyChanged;
        ws.LogReceived += OnLog;

        Unloaded += OnUnloaded;
    }

    // -----------------------------
    // JSON loading
    // -----------------------------

    private void LoadSettingsUi()
    {
        var json = LoadSettingsJson();

        var ui = JsonSerializer.Deserialize<SettingsUi>(
            json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
        ) ?? new SettingsUi();

        foreach (var section in ui.Sections)
        {
            SettingsPanel.Children.Add(CreateSectionHeader(section.Title));

            foreach (var setting in section.Settings)
            {
                var control = CreateControl(setting);
                _controls[setting.Key] = control;
                SettingsPanel.Children.Add(control);
            }
        }
    }
    
    private string LoadSettingsJson()
    {
        var assembly = typeof(SettingsView).Assembly;

        // Namespace + folder + filename
        var resourceName = "kiosk_wpf.App.SettingsView.json";

        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream == null)
            throw new Exception($"Embedded resource not found: {resourceName}");

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }


    private static TextBlock CreateSectionHeader(string title) =>
        new()
        {
            Text = title,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 6)
        };

    // -----------------------------
    // Control factory
    // -----------------------------

    private FrameworkElement CreateControl(Setting setting)
    {
        return setting.Type switch
        {
            "text" => CreateText(setting),
            "checkbox" => CreateCheckbox(setting),
            "select" => CreateSelect(setting),
            _ => throw new NotSupportedException($"Unknown setting type: {setting.Type}")
        };
    }

    private FrameworkElement CreateText(Setting setting)
    {
        var tb = new TextBox
        {
            Height = 32,
            Margin = new Thickness(0, 0, 0, 16),
            Text = setting.Default?.ToString() ?? ""
        };

        tb.TextChanged += OnSettingChanged;
        return tb;
    }

    private FrameworkElement CreateCheckbox(Setting setting)
    {
        var cb = new CheckBox
        {
            Content = setting.Label,
            Margin = new Thickness(0, 0, 0, 16),
            IsChecked = setting.Default as bool? ?? false
        };

        cb.Checked += OnSettingChanged;
        cb.Unchecked += OnSettingChanged;
        return cb;
    }

    private FrameworkElement CreateSelect(Setting setting)
    {
        var combo = new ComboBox
        {
            Height = 32,
            Margin = new Thickness(0, 0, 0, 16)
        };

        foreach (var option in setting.Options ?? [])
            combo.Items.Add(new ComboBoxItem { Content = option });

        if (setting.Default != null)
        {
            for (var i = 0; i < combo.Items.Count; i++)
            {
                if ((combo.Items[i] as ComboBoxItem)?.Content?.ToString() == setting.Default.ToString())
                {
                    combo.SelectedIndex = i;
                    break;
                }
            }
        }

        combo.SelectionChanged += OnSettingChanged;
        return combo;
    }

    // -----------------------------
    // Change handling
    // -----------------------------

    private void OnSettingChanged(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded)
            return;

        SendSettings();
    }

    private void SendSettings()
    {
        var values = new Dictionary<string, object?>();

        foreach (var (key, control) in _controls)
        {
            values[key] = control switch
            {
                TextBox tb => tb.Text.Trim(),
                CheckBox cb => cb.IsChecked == true,
                ComboBox cb => (cb.SelectedItem as ComboBoxItem)?.Content?.ToString(),
                _ => null
            };
        }

        var payload = new
        {
            type = "set_settings",
            payload = values
        };

        _ = App.Ws.Client.SendAsync(payload);
    }

    // -----------------------------
    // Existing kiosk logic
    // -----------------------------

    private void OnBusyChanged(bool busy)
    {
        Dispatcher.Invoke(() => IsEnabled = !busy);
    }

    private void OnLog(string text)
    {
        if (text.Contains("settings:locked"))
            Dispatcher.Invoke(() => IsEnabled = false);
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        var ws = App.Ws.Client;
        ws.BusyChanged -= OnBusyChanged;
        ws.LogReceived -= OnLog;
    }
}
