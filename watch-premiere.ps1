# Vigia: sobe o proxy do adb-mcp quando o Premiere abre, derruba quando fecha.
# Não escuta rede por conta própria — só o proxy (proxy.js) abre porta, e só enquanto
# o Premiere estiver rodando. Log em watch-premiere.log para diagnóstico.

$ErrorActionPreference = "SilentlyContinue"
$proxyDir = "D:\ClaudeCode\adb-mcp\adb-proxy-socket"
$logFile = "D:\ClaudeCode\adb-mcp\watch-premiere.log"
$processName = "Adobe Premiere Pro"

function Log($msg) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" | Out-File -FilePath $logFile -Append -Encoding utf8
}

Log "Vigia iniciado."
$proxyProc = $null

while ($true) {
    $premiereRunning = Get-Process -Name $processName -ErrorAction SilentlyContinue

    if ($premiereRunning -and -not $proxyProc) {
        Log "Premiere detectado. Subindo proxy..."
        $proxyProc = Start-Process -FilePath "node" -ArgumentList "proxy.js" `
            -WorkingDirectory $proxyDir -WindowStyle Hidden -PassThru
        Log "Proxy iniciado, PID $($proxyProc.Id)."
    }
    elseif (-not $premiereRunning -and $proxyProc) {
        Log "Premiere fechado. Derrubando proxy PID $($proxyProc.Id)..."
        Stop-Process -Id $proxyProc.Id -Force -ErrorAction SilentlyContinue
        $proxyProc = $null
        Log "Proxy derrubado."
    }
    elseif ($proxyProc -and $proxyProc.HasExited) {
        Log "Proxy caiu sozinho (PID antigo $($proxyProc.Id)). Limpando estado."
        $proxyProc = $null
    }

    Start-Sleep -Seconds 5
}
