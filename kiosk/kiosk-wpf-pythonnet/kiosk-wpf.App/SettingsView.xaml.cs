using System.Diagnostics;
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

    public double? Min { get; set; }
    public double? Max { get; set; }
    public double? Step { get; set; }
}

public partial class SettingsView
{
    private readonly Dictionary<string, FrameworkElement> _controls = new();

    // Public property to access current settings
    public Dictionary<string, object?> CurrentSettings => CollectSettings();

    // Event raised when settings change
    public event EventHandler? SettingsChanged;

    public SettingsView()
    {
        InitializeComponent();
        LoadSettingsUi();
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
        var resourceName = "kiosk_wpf.App.SettingsView.json";

        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream == null)
            throw new Exception($"Embedded resource not found: {resourceName}");

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    private static TextBlock CreateSectionHeader(string title)
    {
        return new TextBlock
        {
            Text = title,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 6)
        };
    }

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
            "number" => CreateNumber(setting),
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
            for (var i = 0; i < combo.Items.Count; i++)
                if ((combo.Items[i] as ComboBoxItem)?.Content?.ToString() ==
                    setting.Default.ToString())
                {
                    combo.SelectedIndex = i;
                    break;
                }

        combo.SelectionChanged += OnSettingChanged;
        return combo;
    }

    private FrameworkElement CreateNumber(Setting setting)
    {
        var tb = new TextBox
        {
            Height = 32,
            Margin = new Thickness(0, 0, 0, 16),
            Text = setting.Default?.ToString() ?? ""
        };

        tb.PreviewTextInput += (_, e) =>
            e.Handled = !IsNumericInput(tb.Text, e.Text);

        tb.LostFocus += (_, _) =>
        {
            if (!double.TryParse(tb.Text, out var value))
            {
                tb.Text = setting.Default?.ToString() ?? "0";
                return;
            }

            if (setting.Min is not null && value < setting.Min)
                tb.Text = setting.Min.ToString();

            if (setting.Max is not null && value > setting.Max)
                tb.Text = setting.Max.ToString();
        };

        tb.TextChanged += OnSettingChanged;
        return tb;
    }

    // -----------------------------
    // Change handling
    // -----------------------------

    private void OnSettingChanged(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded)
            return;

        // Log to debug (optional)
        var settings = CollectSettings();
        foreach (var (key, value) in settings)
            Debug.WriteLine($"[settings] {key} = {value}");

        // Raise event to notify MainWindow
        SettingsChanged?.Invoke(this, EventArgs.Empty);
    }

    private Dictionary<string, object?> CollectSettings()
    {
        var values = new Dictionary<string, object?>();

        foreach (var (key, control) in _controls)
            values[key] = control switch
            {
                TextBox tb when double.TryParse(tb.Text, out var n) => n,
                TextBox tb => tb.Text.Trim(),
                CheckBox cb => cb.IsChecked == true,
                ComboBox cb => (cb.SelectedItem as ComboBoxItem)?.Content?.ToString(),
                _ => null
            };

        return values;
    }

    // -----------------------------
    // Utilities
    // -----------------------------

    private static bool IsNumericInput(string current, string input)
    {
        return double.TryParse(current + input, out _);
    }
}