' Sincronizador en segundo plano sin ventana (invisible)
' Inicia el demonio de sincronizacion de suscripciones IA hacia el NAS Synology.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptPath = "Z:\IA\02_Proyectos\Dashboard_Uso_APIs\scripts\sync-subscriptions.js"

' Esperar hasta 60 segundos por si la unidad de red Z: tarda en estar disponible al iniciar sesion
For i = 1 To 60
    If fso.FileExists(scriptPath) Then Exit For
    WScript.Sleep 1000
Next

If fso.FileExists(scriptPath) Then
    nodeExe = "node"
    If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
        nodeExe = "C:\Program Files\nodejs\node.exe"
    End If
    
    appData = WshShell.ExpandEnvironmentStrings("%APPDATA%")
    logDir = appData & "\Dashboard_Uso_APIs"
    If Not fso.FolderExists(logDir) Then
        fso.CreateFolder(logDir)
    End If
    logFile = logDir & "\sync.log"

    WshShell.CurrentDirectory = "Z:\IA\02_Proyectos\Dashboard_Uso_APIs"
    cmd = "cmd.exe /c " & chr(34) & chr(34) & nodeExe & chr(34) & " " & chr(34) & scriptPath & chr(34) & " --daemon >> " & chr(34) & logFile & chr(34) & " 2>&1" & chr(34)

    ' Ejecuta de forma permanente en segundo plano. Si falla o cae, reinicia tras 10 segundos.
    Do While True
        WshShell.Run cmd, 0, True
        WScript.Sleep 10000
    Loop
End If
