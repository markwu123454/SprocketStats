using System.IO;
using System.Text.Json;

namespace kiosk_wpf_python.App
{
    public class LocalStorage
    {
        private readonly string _filePath;
        private readonly Dictionary<string, string> _data;
        private static readonly JsonSerializerOptions _jsonOpts = new() { WriteIndented = true };

        private static LocalStorage? _instance;
        public static LocalStorage Default =>
            _instance ??= new LocalStorage(
                Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "kiosk-wpf-python",
                    "localStorage.json"));

        public LocalStorage(string filePath)
        {
            _filePath = filePath;
            Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
            _data = Load();
        }

        public void SetItem(string key, string value) { _data[key] = value; Save(); }
        public string? GetItem(string key) => _data.TryGetValue(key, out var v) ? v : null;

        public void SetJson<T>(string key, T value) => SetItem(key, JsonSerializer.Serialize(value, _jsonOpts));
        public T? GetJson<T>(string key)
        {
            var raw = GetItem(key);
            if (raw is null) return default;
            try { return JsonSerializer.Deserialize<T>(raw); }
            catch { return default; }
        }

        public void SetInt(string key, int value) => SetItem(key, value.ToString());
        public int GetInt(string key, int fallback = 0) => int.TryParse(GetItem(key), out var v) ? v : fallback;

        public void SetBool(string key, bool value) => SetItem(key, value.ToString());
        public bool GetBool(string key, bool fallback = false) => bool.TryParse(GetItem(key), out var v) ? v : fallback;

        public void SetDouble(string key, double value) => SetItem(key, value.ToString());
        public double GetDouble(string key, double fallback = 0.0) => double.TryParse(GetItem(key), out var v) ? v : fallback;

        public void RemoveItem(string key) { if (_data.Remove(key)) Save(); }
        public void Clear() { _data.Clear(); Save(); }
        public bool ContainsKey(string key) => _data.ContainsKey(key);
        public IEnumerable<string> Keys => _data.Keys;

        private Dictionary<string, string> Load()
        {
            if (!File.Exists(_filePath)) return new Dictionary<string, string>();
            try
            {
                var json = File.ReadAllText(_filePath);
                return JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? new();
            }
            catch { return new Dictionary<string, string>(); }
        }

        private void Save() => File.WriteAllText(_filePath, JsonSerializer.Serialize(_data, _jsonOpts));
    }
}