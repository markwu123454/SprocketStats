using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Threading;

namespace kiosk_avalonia;

// -----------------------------
// Models
// -----------------------------

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

// -----------------------------
// View
// -----------------------------

public partial class SettingsView : UserControl
{
    private readonly Dictionary<string, Control> _controls = new();

    public SettingsView()
    {
        InitializeComponent();

        // Material layout spacing
        SettingsPanel.Spacing = 12;
        SettingsPanel.Margin = new Thickness(16);

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
        var resourceName = "kiosk-avalonia.SettingsView.json";

        using var stream = assembly.GetManifestResourceStream(resourceName)
                           ?? throw new Exception($"Embedded resource not found: {resourceName}");

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    private static TextBlock CreateSectionHeader(string title)
    {
        return new TextBlock
        {
            Text = title,
            Classes = { "Headline6" }, // Material typography
            Margin = new Thickness(0, 16, 0, 8)
        };
    }

    // -----------------------------
    // Control factory
    // -----------------------------

    private Control CreateControl(Setting setting)
    {
        return setting.Type switch
        {
            "text" => CreateText(setting),
            "checkbox" => CreateCheckbox(setting),
            "select" => CreateSelect(setting),
            _ => throw new NotSupportedException($"Unknown setting type: {setting.Type}")
        };
    }

    private Control CreateText(Setting setting)
    {
        var tb = new TextBox
        {
            Text = setting.Default?.ToString() ?? "",
            Classes = { "Outlined" }
        };

        tb.PropertyChanged += (_, e) =>
        {
            if (e.Property == TextBox.TextProperty)
                OnSettingChanged();
        };

        return tb;
    }

    private Control CreateCheckbox(Setting setting)
    {
        var cb = new CheckBox
        {
            Content = setting.Label,
            IsChecked = setting.Default as bool? ?? false
        };

        cb.PropertyChanged += (_, e) =>
        {
            if (e.Property == CheckBox.IsCheckedProperty)
                OnSettingChanged();
        };

        return cb;
    }

    private Control CreateSelect(Setting setting)
    {
        var combo = new ComboBox
        {
            ItemsSource = setting.Options ?? new List<string>(),
            Classes = { "Outlined" }
        };

        if (setting.Default != null)
            combo.SelectedItem = setting.Default.ToString();

        combo.PropertyChanged += (_, e) =>
        {
            if (e.Property == ComboBox.SelectedItemProperty)
                OnSettingChanged();
        };

        return combo;
    }

    // -----------------------------
    // Change handling
    // -----------------------------

    private void OnSettingChanged()
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
                TextBox tb => tb.Text?.Trim(),
                CheckBox cb => cb.IsChecked == true,
                ComboBox cb => cb.SelectedItem?.ToString(),
                _ => null
            };
        }

        _ = App.Ws.Client.SendAsync(new
        {
            type = "set_settings",
            payload = values
        });
    }

    // -----------------------------
    // Existing kiosk logic
    // -----------------------------

    private void OnBusyChanged(bool busy)
    {
        Dispatcher.UIThread.Post(() => IsEnabled = !busy);
    }

    private void OnLog(string text)
    {
        if (text.Contains("settings:locked"))
            Dispatcher.UIThread.Post(() => IsEnabled = false);
    }

    private void OnUnloaded(object? sender, EventArgs e)
    {
        var ws = App.Ws.Client;
        ws.BusyChanged -= OnBusyChanged;
        ws.LogReceived -= OnLog;
    }
}
