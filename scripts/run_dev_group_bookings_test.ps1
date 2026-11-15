# ==============================================================================
# DISPOSABLE LOCAL POSTGRESQL ENGINE TEST RUNNER: GROUP BOOKINGS INTEGRATION
# ==============================================================================
# - Runs 100% locally on a temporary, isolated PostgreSQL 18 cluster.
# - Does NOT connect to production, staging, or any remote database.
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
$testPort = 54333
$guid = [System.Guid]::NewGuid().ToString("N")
$clusterDir = [System.IO.Path]::Combine($env:TEMP, "disposable_group_test_" + $guid)
$logFile = [System.IO.Path]::Combine($clusterDir, "server.log")

Write-Host "================================================================================"
Write-Host "🚀 INITIALIZING DISPOSABLE POSTGRESQL 18 GROUP BOOKING AUDIT CLUSTER"
Write-Host "================================================================================"
Write-Host "  Directory : $clusterDir"
Write-Host "  Port      : $testPort (loopback 127.0.0.1)"
Write-Host "  Auth      : Trust (isolated to disposable cluster only)"

$serverStarted = $false
$testExitCode = 1

try {
    # 2. Initialize ephemeral cluster
    Write-Host "`n[1/4] Running initdb for disposable cluster..."
    & $initdbExe -U postgres -A trust -D "$clusterDir" -E UTF8 --no-locale | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "initdb failed with exit code $LASTEXITCODE"
    }
    Write-Host "      Disposable cluster initialized successfully."

    # 3. Start ephemeral PostgreSQL server
    Write-Host "`n[2/4] Starting ephemeral PostgreSQL 18 instance on port $testPort..."
    & $pgCtlExe start -D "$clusterDir" -l "$logFile" -o "-p $testPort"
    if ($LASTEXITCODE -ne 0) {
        throw "pg_ctl start failed with exit code $LASTEXITCODE"
    }
    $serverStarted = $true
    Start-Sleep -Seconds 2
    Write-Host "      Ephemeral PostgreSQL server is ready and accepting connections."

    # 4. Create disposable test database
    Write-Host "`n[3/4] Creating test database 'disposable_group_test'..."
    $createdbExe = Join-Path $pgBin "createdb.exe"
    & $createdbExe -h 127.0.0.1 -p $testPort -U postgres disposable_group_test | Out-Null
    Write-Host "      Database 'disposable_group_test' ready."

    # 5. Execute live PostgreSQL integration test suite
    Write-Host "`n[4/4] Executing live PostgreSQL development integration test suite..."
    Write-Host "--------------------------------------------------------------------------------"
    $env:DEV_PGHOST = "127.0.0.1"
    $env:DEV_PGPORT = "$testPort"
    $env:DEV_PGUSER = "postgres"
    $env:DEV_PGPASSWORD = ""
    $env:DEV_PGDATABASE = "disposable_group_test"

    node scripts/test_dev_database_group_bookings.mjs
    $testExitCode = $LASTEXITCODE
    Write-Host "--------------------------------------------------------------------------------"
}
finally {
    # 6. Clean shutdown and directory cleanup
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

