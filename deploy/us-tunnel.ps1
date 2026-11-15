param(
    [ValidateSet('Start', 'Stop', 'Status', 'RunTunnel')]
    [string]$Action = 'Status',
    [ValidateSet('us-server-cf')]
    [string]$Server = 'us-server-cf',
    [string]$Key = (Join-Path $HOME '.ssh/us-server-ed25519'),
    [string]$PublicOrigin = 'https://api.yisama.asia'
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
    $ssh = Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
    $identity = @(& $ssh -o BatchMode=yes -o ConnectTimeout=30 $Server 'hostname; whoami')
    if ($LASTEXITCODE -ne 0 -or ($identity -join "`n").Trim() -cne "ser021360749320`nroot") {
        throw 'US Cloudflare SSH identity probe failed; stop for diagnosis.'
    }
    $sshArguments = @(
        '-n', '-N', '-T', '-i', $Key,
        '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
        '-o', 'PasswordAuthentication=no', '-o', 'KbdInteractiveAuthentication=no',
        '-o', 'ConnectTimeout=10', '-o', 'ExitOnForwardFailure=yes',
        '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3',
        '-E', (Join-Path $runtimeDir 'tunnel.log'),
        '-R', '127.0.0.1:32984:127.0.0.1:32084'
    )
    & $ssh @sshArguments $Server
    throw "US Cloudflare SSH tunnel stopped ($LASTEXITCODE); inspect tunnel.log before restarting."
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
            '-PublicOrigin', $PublicOrigin) `
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
