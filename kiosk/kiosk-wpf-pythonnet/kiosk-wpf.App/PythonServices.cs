using Python.Runtime;

namespace kiosk_wpf.App;

public sealed class PythonService
{
    private readonly PyObject _service;

    public PythonService()
    {
        using (Py.GIL())
        {
            _service = Py.Import("service"); // service.py
        }
    }

    public void SetBusy(bool busy)
    {
        using (Py.GIL())
        {
            _service.InvokeMethod(
                "set_busy", busy.ToPython());
        }
    }

    public bool IsBusy()
    {
        using (Py.GIL())
        {
            return _service.InvokeMethod("is_busy").As<bool>();
        }
    }

    public string RunCalculation(string inputPath)
    {
        using (Py.GIL())
        {
            return _service.InvokeMethod(
                "run_calculation", inputPath.ToPython()).As<string>();
        }
    }

    public void RegisterLogger(Action<string> logger)
    {
        using (Py.GIL())
        {
            _service.InvokeMethod(
                "register_logger", logger.ToPython());
        }
    }

    public void ExecuteCommand(string code)
    {
        using (Py.GIL())
        {
            _service.InvokeMethod(
                "exec_command", code.ToPython());
        }
    }

    public void RegisterSetBusy(Action<bool> callback)
    {
        using (Py.GIL())
        {
            _service.InvokeMethod(
                "register_set_busy", callback.ToPython());
        }
    }
}