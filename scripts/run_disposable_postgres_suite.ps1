# ==============================================================================
# DISPOSABLE LOCAL POSTGRESQL ENGINE CONCURRENCY & HARDENING TEST RUNNER
# ==============================================================================
# - Runs 100% locally on a temporary, isolated PostgreSQL 18 cluster.
# - Does NOT connect to production, staging, or the system PostgreSQL service.
# - Does NOT modify .env.local, system pg_hba.conf, or any persistent files.
# - Spawns on an ephemeral loopback port, runs tests, stops, and cleans up.
# ==============================================================================

$ErrorActionPreference = "Stop"

$pgBin = "C:\Program Files\PostgreSQL\18\bin"
$initdbExe = Join-Path $pgBin "initdb.exe"
$pgCtlExe = Join-Path $pgBin "pg_ctl.exe"

if (-not (Test-Path $initdbExe) -or -not (Test-Path $pgCtlExe)) {
    throw "PostgreSQL 18 binaries not found in '$pgBin'."
}

# 1. Select ephemeral loopback port
$testPort = 54332
$guid = [System.Guid]::NewGuid().ToString("N")
$clusterDir = [System.IO.Path]::Combine($env:TEMP, "disposable_pg_cluster_" + $guid)
$logFile = [System.IO.Path]::Combine($clusterDir, "server.log")

Write-Host "================================================================================"
Write-Host "🚀 INITIALIZING DISPOSABLE POSTGRESQL 18 AUDIT CLUSTER"
Write-Host "================================================================================"
Write-Host "  Directory : $clusterDir"
Write-Host "  Port      : $testPort (loopback 127.0.0.1)"
Write-Host "  Auth      : Trust (isolated to disposable cluster only)"

$serverStarted = $false
$testExitCode = 1

try {
    # 2. Initialize ephemeral cluster
    Write-Host "`n[1/3] Running initdb for disposable cluster..."
    & $initdbExe -U postgres -A trust -D "$clusterDir" -E UTF8 --no-locale | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "initdb failed with exit code $LASTEXITCODE"
    }
    Write-Host "      Disposable cluster initialized successfully."

    # 3. Start ephemeral PostgreSQL server
    Write-Host "`n[2/3] Starting ephemeral PostgreSQL 18 instance on port $testPort..."
    & $pgCtlExe start -D "$clusterDir" -l "$logFile" -o "-p $testPort"
    if ($LASTEXITCODE -ne 0) {
        throw "pg_ctl start failed with exit code $LASTEXITCODE"
    }
    $serverStarted = $true
    Start-Sleep -Seconds 2
    Write-Host "      Ephemeral PostgreSQL server is ready and accepting connections."

    # 4. Execute live PostgreSQL concurrency & hardening audit suite
    Write-Host "`n[3/3] Executing live PostgreSQL concurrency and hardening audit suite..."
    Write-Host "--------------------------------------------------------------------------------"
    $env:PGHOST = "127.0.0.1"
    $env:PGPORT = "$testPort"
    $env:PGUSER = "postgres"
    $env:PGPASSWORD = ""

    node src/scripts/test_postgres_live_concurrency.mjs
    $testExitCode = $LASTEXITCODE
    Write-Host "--------------------------------------------------------------------------------"
}
finally {
    # 5. Guaranteed clean shutdown and directory cleanup
    if ($serverStarted) {
        Write-Host "`n🧹 Stopping ephemeral PostgreSQL instance on port $testPort..."
        & $pgCtlExe stop -D "$clusterDir" -m immediate | Out-Null
        Start-Sleep -Seconds 1
    }

    if (Test-Path $clusterDir) {
        Write-Host "🧹 Removing disposable cluster directory..."
        Remove-Item -Path $clusterDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "✅ Disposable cluster shutdown and cleaned up cleanly. Zero residual state."
}

exit $testExitCode
