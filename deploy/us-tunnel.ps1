param(
    [ValidateSet('Start', 'Stop', 'Status', 'RunTunnel')]
    [string]$Action = 'Status',
    [string]$Server = '156.238.252.115',
    [string]$Key = (Join-Path $HOME '.ssh/us-server-ed25519'),
    [string]$PublicOrigin = 'https://api.yisama.asia',
    [string]$ProxyAddress = '127.0.0.1:30000'
)

$ErrorActionPreference = 'Stop'
$runtimeDir = Join-Path (Split-Path $PSScriptRoot -Parent) '.runtime'
$statePath = Join-Path $runtimeDir 'us-tunnel.json'
$state = if (Test-Path -LiteralPath $statePath) {
    Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
}

function Get-OwnedProcess($item) {
    if (-not $item) { return $null }
    $process = Get-Process -Id $item.pid -ErrorAction SilentlyContinue
    if ($process -and $process.Path -eq $item.path -and
        $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $item.ticks) {
        return $process
    }
    return $null
}

function Get-Identity($process) {
    return @{
        pid = $process.Id
        path = $process.Path
        ticks = $process.StartTime.ToUniversalTime().Ticks.ToString()
    }
}

if ($Action -eq 'RunTunnel') {
    $sshArguments = @(
        '-n', '-N', '-T', '-p', '22', '-l', 'root', '-i', $Key,
        '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
        '-o', 'PasswordAuthentication=no', '-o', 'KbdInteractiveAuthentication=no',
        '-o', 'ConnectTimeout=10', '-o', 'ExitOnForwardFailure=yes',
        '-o', 'ServerAliveInterval=2', '-o', 'ServerAliveCountMax=3',
        '-E', (Join-Path $runtimeDir 'tunnel.log'),
        '-R', '127.0.0.1:32984:127.0.0.1:32084'
    )
    if ($ProxyAddress) {
        $connect = 'C:/Program Files/Git/mingw64/bin/connect.exe'
        if (-not (Test-Path -LiteralPath $connect)) { throw 'Git connect.exe is missing.' }
        $sshArguments += @('-o', "ProxyCommand=`"$connect`" -S $ProxyAddress %h %p")
    }
    & ssh.exe @sshArguments $Server
    exit $LASTEXITCODE
}

if ($Action -eq 'Status') {
    [pscustomobject]@{
        GatewayRunning = [bool](Get-OwnedProcess $state.gateway)
        TunnelRunning = [bool](Get-OwnedProcess $state.tunnel)
        Url = "$PublicOrigin/qrveo-live/__qrveo/console/#/secure/overview"
    }
    return
}

if ($Action -eq 'Stop') {
    foreach ($item in @($state.tunnel, $state.gateway)) {
        $process = Get-OwnedProcess $item
        if ($process) {
            if ($item -eq $state.tunnel) {
                Get-CimInstance Win32_Process -Filter "ParentProcessId = $($process.Id)" |
                    Where-Object Name -eq 'ssh.exe' |
                    ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
            }
            Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
        }
    }
    if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
    Write-Output 'QRveo public tunnel stopped; local backend is still running.'
    return
}

if ((Get-OwnedProcess $state.gateway) -or (Get-OwnedProcess $state.tunnel)) {
    throw 'An owned process is still running. Check Status or Stop before starting again.'
}
if (-not (Test-Path -LiteralPath $Key -PathType Leaf)) { throw 'SSH key is missing.' }
if (Get-NetTCPConnection -State Listen -LocalPort 32084 -ErrorAction SilentlyContinue) {
    throw 'Local port 32084 is already in use.'
}
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$gateway = $null
$tunnel = $null
try {
    $env:QRVEO_PUBLIC_ORIGIN = $PublicOrigin
    $env:QRVEO_GATEWAY_PORT = '32084'
    $gatewayPath = Join-Path $PSScriptRoot 'demo-gateway.cjs'
    $gateway = Start-Process -FilePath (Get-Command node.exe).Source -WindowStyle Hidden -PassThru `
        -ArgumentList @('"' + $gatewayPath + '"') `
        -RedirectStandardOutput (Join-Path $runtimeDir 'gateway.stdout.log') `
        -RedirectStandardError (Join-Path $runtimeDir 'gateway.stderr.log')
    $ready = $false
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        Start-Sleep -Milliseconds 300
        if ($gateway.HasExited) { throw 'Gateway exited; inspect .runtime/gateway.stderr.log.' }
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:32084/qrveo-live/healthz' -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
    }
    if (-not $ready) { throw 'Local gateway did not become ready.' }

    $tunnel = Start-Process -FilePath (Get-Command pwsh.exe).Source -WindowStyle Hidden -PassThru `
        -ArgumentList @('-NoProfile', '-File', ('"' + $PSCommandPath + '"'),
            '-Action', 'RunTunnel', '-Server', $Server, '-Key', ('"' + $Key + '"'),
            '-PublicOrigin', $PublicOrigin, '-ProxyAddress', ('"' + $ProxyAddress + '"')) `
        -RedirectStandardOutput (Join-Path $runtimeDir 'tunnel.stdout.log') `
        -RedirectStandardError (Join-Path $runtimeDir 'tunnel.stderr.log')
    Start-Sleep -Seconds 2
    if ($tunnel.HasExited) { throw 'SSH tunnel exited; inspect .runtime/tunnel.log.' }
    @{
        gateway = Get-Identity $gateway
        tunnel = Get-Identity $tunnel
        origin = $PublicOrigin
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding utf8
    Write-Output 'Gateway and SSH process started. Verify the public HTTPS health endpoint.'
} catch {
    if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id }
    if ($gateway -and -not $gateway.HasExited) { Stop-Process -Id $gateway.Id }
    throw
}
