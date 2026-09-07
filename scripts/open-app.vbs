On Error Resume Next
Set xmlHttp = CreateObject("MSXML2.ServerXMLHTTP.6.0")
xmlHttp.open "GET", "http://localhost:3101/api/settings", False
xmlHttp.setTimeouts 500, 500, 500, 500
xmlHttp.send

Set WshShell = CreateObject("WScript.Shell")

If Err.Number <> 0 Then
    ' Next.js server is not running, start it silently
    WshShell.Run "cmd.exe /c ""d: && cd d:\code\personal_projects\recall && npm run app:start""", 0, False
    ' Poll server for up to 10 seconds until listening
    Dim i
    For i = 1 To 20
        WScript.Sleep 500
        Err.Clear
        Set xmlHttp = CreateObject("MSXML2.ServerXMLHTTP.6.0")
        xmlHttp.open "GET", "http://localhost:3101/api/settings", False
        xmlHttp.setTimeouts 500, 500, 500, 500
        xmlHttp.send
        If Err.Number = 0 Then Exit For
    Next
End If


' Launch Chrome in App Mode (borderless, separate taskbar icon)
Err.Clear
WshShell.Run "chrome.exe --app=http://localhost:3101", 1
If Err.Number <> 0 Then
    ' Fallback to Edge if Chrome is not in PATH
    Err.Clear
    WshShell.Run "msedge.exe --app=http://localhost:3101", 1
End If
