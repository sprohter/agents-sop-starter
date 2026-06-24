[CmdletBinding()]
param(
    [string]$AgentsRoot = '',
    [string]$Config = '',
    [string]$StateRoot = '',
    [string]$PeerId = '',
    [string]$KeyFile = '',
    [string]$KeyEnv = '',
    [int]$TimeoutSeconds = 20,
    [switch]$SkipSignedSelfCheck
)

$ErrorActionPreference = 'Stop'

function Resolve-DefaultAgentsRoot {
    return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
}

function Write-JsonLine {
    param([object]$Value)
    $json = $Value | ConvertTo-Json -Depth 12
    [Console]::Out.WriteLine($json)
}

$root = if ([string]::IsNullOrWhiteSpace($AgentsRoot)) { Resolve-DefaultAgentsRoot } else { [System.IO.Path]::GetFullPath($AgentsRoot) }
$configPath = if ([string]::IsNullOrWhiteSpace($Config)) { Join-Path $root 'runtime\local-secrets\mesh-p2p\peers.json' } else { [System.IO.Path]::GetFullPath($Config) }
$stateRootPath = if ([string]::IsNullOrWhiteSpace($StateRoot)) { Join-Path $root 'runtime\state\mesh-p2p' } else { [System.IO.Path]::GetFullPath($StateRoot) }
$logDir = Join-Path $stateRootPath 'logs\process'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "P2P config not found: $configPath"
}

$configObj = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($PeerId)) {
    if (-not $configObj.peers -or $configObj.peers.Count -lt 1) {
        throw 'No peer configured; pass -PeerId explicitly.'
    }
    $PeerId = [string]$configObj.peers[0].peer_id
}
$peer = @($configObj.peers | Where-Object { $_.peer_id -eq $PeerId } | Select-Object -First 1)
if ($null -eq $peer) {
    throw "Peer not found in config: $PeerId"
}
if ([string]::IsNullOrWhiteSpace($KeyEnv)) {
    $KeyEnv = [string]$peer.shared_key_env
}
if ([string]::IsNullOrWhiteSpace($KeyEnv)) {
    throw "Peer $PeerId has no shared_key_env."
}
if ([string]::IsNullOrWhiteSpace($KeyFile)) {
    $KeyFile = Join-Path $root 'runtime\local-secrets\mesh-p2p\shared-key-win-mac.txt'
}
if (Test-Path -LiteralPath $KeyFile -PathType Leaf) {
    Set-Item -Path "Env:$KeyEnv" -Value ((Get-Content -Raw -LiteralPath $KeyFile).Trim())
} elseif ([string]::IsNullOrWhiteSpace((Get-Item -Path "Env:$KeyEnv" -ErrorAction SilentlyContinue).Value)) {
    throw "Key file not found and env var is not set: $KeyFile / $KeyEnv"
}

$currentPid = $PID
$targets = Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $currentPid -and (
        ($_.Name -eq 'node.exe' -and ($_.CommandLine -like '*p2p-server.js*' -or $_.CommandLine -like '*p2p-worker.js*')) -or
        ($_.Name -match '^(powershell|pwsh)\.exe$' -and ($_.CommandLine -like '*start-windows-p2p-server.ps1*' -or $_.CommandLine -like '*start-windows-p2p-worker.ps1*'))
    )
}

$stopped = @()
foreach ($proc in @($targets)) {
    try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
        $stopped += [pscustomobject]@{ process_id = $proc.ProcessId; name = $proc.Name; stopped = $true }
    } catch {
        $stopped += [pscustomobject]@{ process_id = $proc.ProcessId; name = $proc.Name; stopped = $false; error = $_.Exception.Message }
    }
}

Start-Sleep -Seconds 2
$serverScript = Join-Path $root 'runtime\local-secrets\mesh-p2p\start-windows-p2p-server.ps1'
$workerScript = Join-Path $root 'runtime\local-secrets\mesh-p2p\start-windows-p2p-worker.ps1'
foreach ($script in @($serverScript, $workerScript)) {
    if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
        throw "Startup script not found: $script"
    }
}

$server = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$serverScript) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'p2p-server.out.log') -RedirectStandardError (Join-Path $logDir 'p2p-server.err.log') -PassThru

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$health = $null
do {
    Start-Sleep -Milliseconds 500
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8788/health' -TimeoutSec 2
    } catch {
        $health = $null
    }
} while (($null -eq $health -or $health.status -ne 'ready') -and (Get-Date) -lt $deadline)

if ($null -eq $health -or $health.status -ne 'ready') {
    throw "p2p-server did not become ready within $TimeoutSeconds seconds. Check $logDir"
}

$worker = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$workerScript) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'p2p-worker.out.log') -RedirectStandardError (Join-Path $logDir 'p2p-worker.err.log') -PassThru

$signedSelfCheck = $null
if (-not $SkipSignedSelfCheck) {
    $tmpConfig = Join-Path $stateRootPath ("tmp-signed-self-check-{0}.json" -f ([guid]::NewGuid().ToString('N')))
    $localNodeId = [string]$configObj.local_node.node_id
    $simulated = [ordered]@{
        local_node = [ordered]@{
            node_id = $PeerId
            display_name = 'Simulated peer for local signed self-check'
            listen_host = '127.0.0.1'
            listen_port = 8788
            public_base_url = 'http://127.0.0.1:8788'
        }
        peers = @(
            [ordered]@{
                peer_id = $localNodeId
                display_name = [string]$configObj.local_node.display_name
                base_url = 'http://127.0.0.1:8788'
                shared_key_env = $KeyEnv
                allowed_capabilities = @($peer.allowed_capabilities)
                allow_inbound = $true
                allow_outbound = $true
            }
        )
    }
    try {
        $simulated | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $tmpConfig -Encoding UTF8
        $doctorOutput = & node (Join-Path $root 'scripts\mesh\p2p-doctor.js') --config $tmpConfig --peer $localNodeId --signed --timeout ($TimeoutSeconds * 1000)
        $signedSelfCheck = $doctorOutput | ConvertFrom-Json
        if (-not [bool]$signedSelfCheck.ok) {
            throw "signed self-check failed: $doctorOutput"
        }
    } finally {
        Remove-Item -LiteralPath $tmpConfig -Force -ErrorAction SilentlyContinue
    }
}

$statusDir = Join-Path $stateRootPath 'status'
$statusFile = Join-Path $statusDir 'p2p-server-status.json'
$status = $null
if (Test-Path -LiteralPath $statusFile -PathType Leaf) {
    $status = Get-Content -Raw -LiteralPath $statusFile | ConvertFrom-Json
}

$result = [pscustomobject][ordered]@{
    ok = $true
    status = 'restarted'
    stopped = $stopped
    server_wrapper_pid = $server.Id
    worker_wrapper_pid = $worker.Id
    health = $health
    signed_self_check = $signedSelfCheck
    runtime_status_file = $statusFile
    runtime_status = $status
    logs = $logDir
}

New-Item -ItemType Directory -Force -Path $statusDir | Out-Null
$resultPath = Join-Path $statusDir 'restart-windows-p2p-last-result.json'
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $resultPath -Encoding UTF8
Write-JsonLine $result
