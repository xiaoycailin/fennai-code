# fcode-server (Tray Manager)

Windows tray app untuk manage:
- `fcode app-server --listen ws://127.0.0.1:7070`
- `npm.cmd run start -- -p 25845` dari `web-ui-v2`

## Build EXE (tanpa .NET SDK)

```powershell
cd D:\1aiagent-coding\codex-rs\web-ui\fcode-server
& "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" `
  /nologo /target:winexe /optimize+ `
  /win32icon:D:\1aiagent-coding\codex-rs\web-ui\fcode-server\fcode-icon.ico `
  /out:D:\1aiagent-coding\codex-rs\web-ui\fcode-server\bin\Release\fcode-server.exe `
  /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll `
  D:\1aiagent-coding\codex-rs\web-ui\fcode-server\Program.cs
```

Output:
- `D:\1aiagent-coding\codex-rs\web-ui\fcode-server\bin\Release\fcode-server.exe`

## Run
```powershell
start "" "D:\1aiagent-coding\codex-rs\web-ui\fcode-server\bin\Release\fcode-server.exe"
```

Custom ports:
```powershell
start "" "D:\1aiagent-coding\codex-rs\web-ui\fcode-server\bin\Release\fcode-server.exe" --port 25845 --ws-port 7070
```

Web UI:
- `http://localhost:25845`

## Tray Menu

- Open FCode Web UI
- Open Logs Folder
- Open App-Server Log
- Open Web-UI Log
- Restart Services
- Stop Services
- Start Services
- Start on startup
- Quit
