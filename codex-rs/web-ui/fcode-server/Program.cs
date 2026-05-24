using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Windows.Forms;
using Microsoft.Win32;

namespace FcodeServer
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            var options = TrayOptions.FromArgs(Environment.GetCommandLineArgs());
            using (var app = new TrayApp(options))
            {
                Application.Run();
            }
        }
    }

    internal sealed class TrayOptions
    {
        public int WebUiPort { get; private set; }
        public int WsPort { get; private set; }

        public TrayOptions()
        {
            WebUiPort = 25845;
            WsPort = 7070;
        }

        public static TrayOptions FromArgs(string[] args)
        {
            var options = new TrayOptions();
            for (var i = 1; i < args.Length; i++)
            {
                var token = args[i];
                if ((token == "--port" || token == "-p") && i + 1 < args.Length)
                {
                    int webPort;
                    if (int.TryParse(args[++i], out webPort) && webPort > 0 && webPort <= 65535)
                    {
                        options.WebUiPort = webPort;
                    }
                    continue;
                }

                if (token == "--ws-port" && i + 1 < args.Length)
                {
                    int wsPort;
                    if (int.TryParse(args[++i], out wsPort) && wsPort > 0 && wsPort <= 65535)
                    {
                        options.WsPort = wsPort;
                    }
                }
            }
            return options;
        }
    }

    internal sealed class TrayApp : IDisposable
    {
        private const string StartupRegistryName = "FCode Server";
        private const string WebUiFolderName = "web-ui-v2";
        private readonly NotifyIcon tray;
        private ToolStripMenuItem statusMenu;
        private ToolStripMenuItem modeMenu;
        private readonly int webUiPort;
        private readonly int wsPort;
        private readonly string workspaceRoot;
        private readonly string webUiRoot;
        private readonly string webUiServerJsPath;
        private readonly string fcodePath;
        private readonly string logRoot;
        private readonly string appServerLogPath;
        private readonly string webUiLogPath;
        private readonly Timer timer;
        private ToolStripMenuItem startupMenu;
        private Process appServer;
        private Process webServer;
        private bool disposed;

        public TrayApp(TrayOptions options)
        {
            webUiPort = options.WebUiPort;
            wsPort = options.WsPort;
            workspaceRoot = FindWorkspaceRoot();
            webUiRoot = ResolveWebUiRoot(workspaceRoot);
            webUiServerJsPath = Path.Combine(webUiRoot, "server.js");
            fcodePath = ResolveFcodePath(workspaceRoot);
            logRoot = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".fcode",
                "web-ui",
                "logs");
            appServerLogPath = Path.Combine(logRoot, "app-server.log");
            webUiLogPath = Path.Combine(logRoot, "web-ui-v2.log");
            Directory.CreateDirectory(logRoot);

            var iconPath = FindIconPath();
            tray = new NotifyIcon
            {
                Icon = LoadIcon(iconPath),
                Text = "FCode Tray",
                Visible = true,
                ContextMenuStrip = BuildMenu(),
            };
            tray.DoubleClick += delegate { OpenUi(); };

            timer = new Timer { Interval = 1500 };
            timer.Tick += delegate { RefreshStatus(); };
            timer.Start();

            StartAll();
            RefreshStatus();
        }

        public void Dispose()
        {
            if (disposed)
            {
                return;
            }

            disposed = true;
            timer.Stop();
            timer.Dispose();
            StopAll();
            tray.Visible = false;
            tray.Dispose();
        }

        private ContextMenuStrip BuildMenu()
        {
            var menu = new ContextMenuStrip();
            statusMenu = new ToolStripMenuItem("Status: Starting services...") { Enabled = false };
            modeMenu = new ToolStripMenuItem(string.Format("Mode: web-ui-v2 preview ({0})", webUiPort)) { Enabled = false };
            menu.Items.Add(statusMenu);
            menu.Items.Add(modeMenu);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("Open FCode Web UI", null, delegate { OpenUi(); }));
            menu.Items.Add(new ToolStripMenuItem("Open Logs Folder", null, delegate { OpenFolder(logRoot); }));
            menu.Items.Add(new ToolStripMenuItem("Open App-Server Log", null, delegate { OpenFileIfExists(appServerLogPath); }));
            menu.Items.Add(new ToolStripMenuItem("Open Web-UI Log", null, delegate { OpenFileIfExists(webUiLogPath); }));
            menu.Items.Add(new ToolStripMenuItem("Restart Services", null, delegate { RestartAll(); }));
            menu.Items.Add(new ToolStripMenuItem("Stop Services", null, delegate { StopAll(); }));
            menu.Items.Add(new ToolStripMenuItem("Start Services", null, delegate { StartAll(); }));
            startupMenu = new ToolStripMenuItem("Start on startup", null, delegate { ToggleStartup(); })
            {
                Checked = IsStartupEnabled(),
            };
            menu.Items.Add(startupMenu);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("Quit", null, delegate { ExitApp(); }));
            return menu;
        }

        private void RefreshStatus()
        {
            var appServerRunning = appServer != null && !appServer.HasExited;
            var webServerRunning = webServer != null && !webServer.HasExited;
            var webHealthy = webServerRunning && IsWebUiReady();
            statusMenu.Text = string.Format(
                "Status: app-server {0} | web-ui-v2 {1}",
                appServerRunning ? "UP" : "DOWN",
                webHealthy ? "READY" : webServerRunning ? "BOOTING" : "DOWN");
            tray.Text = appServerRunning && webHealthy
                ? "FCode Tray - Running"
                : "FCode Tray - Starting/Degraded";
        }

        private void StartAll()
        {
            StartAppServer();
            StartWebServer();
        }

        private void RestartAll()
        {
            StopAll();
            StartAll();
        }

        private void StopAll()
        {
            StopProcess(appServer);
            StopProcess(webServer);
            appServer = null;
            webServer = null;
            RefreshStatus();
        }

        private void ExitApp()
        {
            Dispose();
            Application.Exit();
        }

        private void OpenUi()
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = string.Format("http://localhost:{0}", webUiPort),
                UseShellExecute = true,
            });
        }

        private void ToggleStartup()
        {
            var enabled = !IsStartupEnabled();
            SetStartupEnabled(enabled);
            startupMenu.Checked = enabled;
        }

        private void StartAppServer()
        {
            if (appServer != null && !appServer.HasExited)
            {
                return;
            }

            if (!File.Exists(fcodePath))
            {
                statusMenu.Text = "Status: fcode.exe not found";
                MessageBox.Show(fcodePath, "fcode.exe not found", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            appServer = StartService(
                fcodePath,
                string.Format("app-server --listen ws://127.0.0.1:{0}", wsPort),
                workspaceRoot,
                "app-server");
        }

        private void StartWebServer()
        {
            if (webServer != null && !webServer.HasExited)
            {
                return;
            }

            if (!Directory.Exists(webUiRoot))
            {
                statusMenu.Text = "Status: web-ui-v2 not found";
                MessageBox.Show(webUiRoot, "web-ui-v2 not found", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            if (File.Exists(webUiServerJsPath))
            {
                webServer = StartService(
                    "node.exe",
                    string.Format("{0} -p {1}", Quote(webUiServerJsPath), webUiPort),
                    webUiRoot,
                    "web-ui-v2");
                return;
            }

            webServer = StartService(
                "cmd.exe",
                string.Format("/c npm.cmd run start -- -p {0}", webUiPort),
                webUiRoot,
                "web-ui-v2");
        }

        private Process StartService(string fileName, string arguments, string workingDirectory, string logName)
        {
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    WorkingDirectory = workingDirectory,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                },
                EnableRaisingEvents = true,
            };

            var logPath = Path.Combine(logRoot, logName + ".log");
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                AppendLog(logPath, e.Data);
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                AppendLog(logPath, e.Data);
            };
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            return process;
        }

        private static void StopProcess(Process process)
        {
            if (process == null || process.HasExited)
            {
                return;
            }

            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "taskkill.exe",
                    Arguments = "/PID " + process.Id + " /T /F",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                }).WaitForExit(3000);
            }
            catch
            {
                try
                {
                    process.Kill();
                }
                catch
                {
                }
            }
            finally
            {
                process.Dispose();
            }
        }

        private static void AppendLog(string logPath, string line)
        {
            if (string.IsNullOrEmpty(line))
            {
                return;
            }

            try
            {
                File.AppendAllText(logPath, DateTime.Now.ToString("u") + " " + line + Environment.NewLine);
            }
            catch
            {
            }
        }

        private bool IsWebUiReady()
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(string.Format("http://127.0.0.1:{0}", webUiPort));
                request.Method = "GET";
                request.Timeout = 350;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    return (int)response.StatusCode >= 200 && (int)response.StatusCode < 500;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void OpenFolder(string path)
        {
            if (!Directory.Exists(path))
            {
                return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = Quote(path),
                UseShellExecute = false,
                CreateNoWindow = true,
            });
        }

        private static void OpenFileIfExists(string path)
        {
            if (!File.Exists(path))
            {
                MessageBox.Show(path, "File not found", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = path,
                UseShellExecute = true,
            });
        }

        private static bool IsStartupEnabled()
        {
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", false))
                {
                    var value = key == null ? null : key.GetValue(StartupRegistryName) as string;
                    return string.Equals(value, Quote(AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\') + "\\fcode-server.exe"), StringComparison.OrdinalIgnoreCase);
                }
            }
            catch
            {
                return false;
            }
        }

        private static void SetStartupEnabled(bool enabled)
        {
            using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
            {
                if (key == null)
                {
                    return;
                }

                if (enabled)
                {
                    key.SetValue(StartupRegistryName, Quote(AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\') + "\\fcode-server.exe"));
                    return;
                }

                key.DeleteValue(StartupRegistryName, false);
            }
        }

        private static string Quote(string value)
        {
            return "\"" + value + "\"";
        }

        private static string FindWorkspaceRoot()
        {
            var dir = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
            while (dir != null)
            {
                if (Directory.Exists(Path.Combine(dir.FullName, WebUiFolderName)) &&
                    File.Exists(Path.Combine(dir.FullName, "Cargo.toml")))
                {
                    return dir.FullName;
                }

                dir = dir.Parent;
            }

            return Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", ".."));
        }

        private static string ResolveWebUiRoot(string workspaceRoot)
        {
            var envPath = Environment.GetEnvironmentVariable("FCODE_WEB_UI_V2_PATH");
            if (!string.IsNullOrEmpty(envPath) && Directory.Exists(envPath))
            {
                return envPath;
            }

            var sibling = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, WebUiFolderName);
            if (Directory.Exists(sibling))
            {
                return sibling;
            }

            return Path.Combine(workspaceRoot, WebUiFolderName);
        }

        private static string ResolveFcodePath(string workspaceRoot)
        {
            var envPath = Environment.GetEnvironmentVariable("FCODE_BIN_PATH");
            if (!string.IsNullOrEmpty(envPath) && File.Exists(envPath))
            {
                return envPath;
            }

            var sibling = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "fcode.exe");
            if (File.Exists(sibling))
            {
                return sibling;
            }

            return Path.Combine(workspaceRoot, "target", "debug", "fcode.exe");
        }

        private static string FindIconPath()
        {
            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            var candidates = new[]
            {
                Path.Combine(baseDir, "fcode-icon.ico"),
                Path.GetFullPath(Path.Combine(baseDir, "..", "..", "fcode-icon.ico")),
                Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "fcode-icon.ico")),
            };

            foreach (var candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }

            return candidates[0];
        }

        private static Icon LoadIcon(string pngPath)
        {
            try
            {
                if (string.Equals(Path.GetExtension(pngPath), ".ico", StringComparison.OrdinalIgnoreCase))
                {
                    return new Icon(pngPath);
                }
                using (var image = Image.FromFile(pngPath))
                using (var bitmap = new Bitmap(image, new Size(64, 64)))
                {
                    return Icon.FromHandle(bitmap.GetHicon());
                }
            }
            catch
            {
                return SystemIcons.Application;
            }
        }
    }
}

