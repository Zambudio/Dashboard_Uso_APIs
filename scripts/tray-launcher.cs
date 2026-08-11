using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

internal static class DashboardTrayProgram
{
    private const string MutexName = "Local\\DashboardUsoApisTray";

    [STAThread]
    private static void Main()
    {
        bool createdNew;
        using (var mutex = new Mutex(true, MutexName, out createdNew))
        {
            if (!createdNew)
            {
                OpenDashboard();
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new DashboardTrayContext());
        }
    }

    internal static void OpenDashboard()
    {
        try
        {
            Process.Start(new ProcessStartInfo("http://127.0.0.1:3000") { UseShellExecute = true });
        }
        catch
        {
            // The tray status will still show whether the local server is alive.
        }
    }
}

internal sealed class DashboardTrayContext : ApplicationContext
{
    private const string DashboardUrl = "http://127.0.0.1:3000";
    private readonly NotifyIcon trayIcon;
    private readonly System.Windows.Forms.Timer healthTimer;
    private readonly SynchronizationContext uiContext;
    private readonly Icon startingIcon;
    private readonly Icon readyIcon;
    private readonly Icon errorIcon;
    private Process ownedServer;
    private bool checkInProgress;
    private bool openWhenReady = true;
    private bool exiting;
    private int failedChecks;

    internal DashboardTrayContext()
    {
        uiContext = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
        startingIcon = CreateStatusIcon(Color.FromArgb(245, 166, 35));
        readyIcon = CreateStatusIcon(Color.FromArgb(32, 201, 151));
        errorIcon = CreateStatusIcon(Color.FromArgb(239, 68, 68));

        var menu = new ContextMenuStrip();
        menu.Items.Add("Abrir dashboard", null, delegate { DashboardTrayProgram.OpenDashboard(); });
        menu.Items.Add("Reiniciar servidor", null, delegate { RestartServer(); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Salir", null, delegate { ExitDashboard(); });

        trayIcon = new NotifyIcon
        {
            Icon = startingIcon,
            Text = "Dashboard APIs - iniciando",
            ContextMenuStrip = menu,
            Visible = true
        };
        trayIcon.DoubleClick += delegate { DashboardTrayProgram.OpenDashboard(); };

        healthTimer = new System.Windows.Forms.Timer { Interval = 1000 };
        healthTimer.Tick += delegate { QueueHealthCheck(); };

        if (!IsServerReady())
            StartServer();

        healthTimer.Start();
        QueueHealthCheck();
    }

    private void StartServer()
    {
        string executable = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dashboard.exe");
        if (!File.Exists(executable))
        {
            SetError("No se encuentra dashboard.exe junto al lanzador.");
            return;
        }

        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = executable,
                WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            startInfo.EnvironmentVariables["DASHBOARD_NO_BROWSER"] = "1";
            ownedServer = Process.Start(startInfo);
            failedChecks = 0;
            trayIcon.Icon = startingIcon;
            trayIcon.Text = "Dashboard APIs - iniciando";
        }
        catch (Exception ex)
        {
            SetError("No se pudo iniciar: " + ex.Message);
        }
    }

    private void RestartServer()
    {
        openWhenReady = false;
        StopOwnedServer();
        StartServer();
        trayIcon.ShowBalloonTip(2000, "Dashboard APIs", "Reiniciando el servidor...", ToolTipIcon.Info);
    }

    private void QueueHealthCheck()
    {
        if (checkInProgress || exiting) return;
        checkInProgress = true;
        ThreadPool.QueueUserWorkItem(delegate
        {
            bool ready = IsServerReady();
            uiContext.Post(delegate
            {
                checkInProgress = false;
                ApplyHealthState(ready);
            }, null);
        });
    }

    private void ApplyHealthState(bool ready)
    {
        if (exiting) return;

        if (ready)
        {
            failedChecks = 0;
            trayIcon.Icon = readyIcon;
            trayIcon.Text = "Dashboard APIs - activo";
            if (openWhenReady)
            {
                openWhenReady = false;
                DashboardTrayProgram.OpenDashboard();
                trayIcon.ShowBalloonTip(1800, "Dashboard APIs", "El dashboard está activo.", ToolTipIcon.Info);
            }
            return;
        }

        failedChecks++;
        trayIcon.Icon = failedChecks < 15 ? startingIcon : errorIcon;
        trayIcon.Text = failedChecks < 15 ? "Dashboard APIs - iniciando" : "Dashboard APIs - sin conexión";

        if (ownedServer != null && ownedServer.HasExited && failedChecks >= 3)
            SetError("El servidor se cerró inesperadamente. Usa 'Reiniciar servidor'.");
    }

    private static bool IsServerReady()
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create(DashboardUrl);
            request.Method = "GET";
            request.Timeout = 900;
            request.ReadWriteTimeout = 900;
            using (var response = (HttpWebResponse)request.GetResponse())
                return response.StatusCode == HttpStatusCode.OK;
        }
        catch
        {
            return false;
        }
    }

    private void SetError(string message)
    {
        trayIcon.Icon = errorIcon;
        trayIcon.Text = "Dashboard APIs - error";
        trayIcon.ShowBalloonTip(5000, "Dashboard APIs", message, ToolTipIcon.Error);
    }

    private void ExitDashboard()
    {
        exiting = true;
        healthTimer.Stop();
        trayIcon.Visible = false;
        StopOwnedServer();
        ExitThread();
    }

    private void StopOwnedServer()
    {
        if (ownedServer == null) return;
        try
        {
            if (!ownedServer.HasExited)
            {
                var taskKill = Process.Start(new ProcessStartInfo
                {
                    FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "taskkill.exe"),
                    Arguments = "/PID " + ownedServer.Id + " /T /F",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                });
                if (taskKill != null) taskKill.WaitForExit(5000);
            }
        }
        catch
        {
            // Windows will reclaim the child processes when the session ends.
        }
        finally
        {
            ownedServer.Dispose();
            ownedServer = null;
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            healthTimer.Dispose();
            trayIcon.Dispose();
            startingIcon.Dispose();
            readyIcon.Dispose();
            errorIcon.Dispose();
        }
        base.Dispose(disposing);
    }

    private static Icon CreateStatusIcon(Color statusColor)
    {
        using (var bitmap = new Bitmap(32, 32))
        using (var graphics = Graphics.FromImage(bitmap))
        using (var background = new SolidBrush(Color.FromArgb(21, 24, 35)))
        using (var accent = new SolidBrush(statusColor))
        using (var line = new Pen(Color.FromArgb(105, 225, 255), 3f))
        {
            graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            graphics.Clear(Color.Transparent);
            graphics.FillEllipse(background, 1, 1, 30, 30);
            graphics.DrawLine(line, 8, 22, 8, 16);
            graphics.DrawLine(line, 16, 22, 16, 11);
            graphics.DrawLine(line, 24, 22, 24, 7);
            graphics.FillEllipse(accent, 22, 2, 8, 8);
            IntPtr handle = bitmap.GetHicon();
            try
            {
                return (Icon)Icon.FromHandle(handle).Clone();
            }
            finally
            {
                DestroyIcon(handle);
            }
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool DestroyIcon(IntPtr handle);
}
