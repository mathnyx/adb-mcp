' Lançador oculto do proxy adb-mcp (porta 3001), criado em 2026-08-20.
' Chamado pela tarefa agendada "adb-mcp-proxy" no logon de MC.
' Janela 0 = oculta. O log fica ao lado, em proxy-tarefa.log.
' Desfazer: schtasks /delete /tn adb-mcp-proxy /f  (e apagar este arquivo)
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "D:\ClaudeCode\adb-mcp\adb-proxy-socket"
shell.Run "cmd /c ""node proxy.js >> proxy-tarefa.log 2>&1""", 0, False
