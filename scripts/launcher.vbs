On Error Resume Next
Set WshShell = CreateObject("WScript.Shell")

' Change drive/directory and run Next.js server silently (0 = hide command window)
WshShell.Run "cmd.exe /c ""d: && cd d:\code\personal_projects\recall && npm run app:start""", 0, False

