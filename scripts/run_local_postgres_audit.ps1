param(
    [string]$PgPassword = $env:PGPASSWORD
)

$ErrorActionPreference = "Stop"
if ($PgPassword) {
    $env:PGPASSWORD = $PgPassword
}

$pgHba = "C:\Program Files\PostgreSQL\18\data\pg_hba.conf"
$pgHbaBak = "C:\Program Files\PostgreSQL\18\data\pg_hba.conf.audit_bak"

# Ensure active configuration file exists
if (-not (Test-Path $pgHba)) {
    throw "PostgreSQL configuration file not found at: $pgHba"
}

# 1. If pg_hba.conf.audit_bak already exists, abort immediately.
# Do not reuse it, overwrite it, or modify the active configuration.
if (Test-Path $pgHbaBak) {
    Write-Error "================================================================================"
    Write-Error "[SECURITY ABORT] Existing backup file detected at '$pgHbaBak'."
    Write-Error "A previous audit execution may have failed, crashed, or was terminated prematurely."
    Write-Error "To prevent configuration corruption or unintended persistent trust rules:"
    Write-Error "  - This script will NOT reuse the existing backup."
    Write-Error "  - This script will NOT overwrite the existing backup."
    Write-Error "  - This script will NOT modify the active '$pgHba' file."
    Write-Error "MANUAL RECOVERY REQUIRED:"
    Write-Error "  1. Inspect '$pgHba' and '$pgHbaBak' to verify current authentication rules."
    Write-Error "  2. Restore '$pgHba' from '$pgHbaBak' if necessary."
    Write-Error "  3. Delete '$pgHbaBak' manually before re-running this script."
    Write-Error "================================================================================"
    throw "Existing backup file '$pgHbaBak' exists. Manual recovery required."
}

# Read active configuration and compute pre-modification SHA-256 hash
$activeContent = Get-Content -Path $pgHba -Raw

# 2. Before modifying pg_hba.conf, verify that the intended localhost SCRAM rule matches exactly once.
# Abort if the match count is zero or greater than one.
$targetScramPattern = "(?m)^host\s+all\s+all\s+127\.0\.0\.1/32\s+scram-sha-256\s*$"
$scramMatches = [regex]::Matches($activeContent, $targetScramPattern)

if ($scramMatches.Count -ne 1) {
    throw "PRE-CONDITION ASSERTION FAILED: Expected exactly 1 active rule matching '^host all all 127.0.0.1/32 scram-sha-256' in '$pgHba', but found $($scramMatches.Count). Aborting immediately. PostgreSQL was NOT restarted and no tests were executed."
}

# Track backup creation for the restoration block
$backupCreated = $false

try {
    # Create the backup file
    Write-Host "[BACKUP] Creating pristine backup of pg_hba.conf at '$pgHbaBak'..."
    Copy-Item -Path $pgHba -Destination $pgHbaBak
    $backupCreated = $true
    $backupHash = (Get-FileHash -Path $pgHbaBak -Algorithm SHA256).Hash

    # Verify backup file itself does not contain trust authentication
    $backupContent = Get-Content -Path $pgHbaBak -Raw
    if ($backupContent -match "(?m)^[ \t]*host[^\r\n]*\btrust\b") {
        throw "SECURITY ALERT: Backup file '$pgHbaBak' already contains active trust rule(s)! Aborting before modification."
    }

    # 3. Verify modified configuration contains exactly the intended temporary localhost rule before restarting PostgreSQL.
    $tempTrustLine = "host    all             all             127.0.0.1/32            trust"
    $modifiedContent = [regex]::Replace($activeContent, $targetScramPattern, $tempTrustLine, 1)

    # In-memory assertions
    $targetTrustPattern = "(?m)^host\s+all\s+all\s+127\.0\.0\.1/32\s+trust\s*$"
    $inMemoryTrustMatches = [regex]::Matches($modifiedContent, $targetTrustPattern)
    $inMemoryScramMatches = [regex]::Matches($modifiedContent, $targetScramPattern)

    if ($inMemoryTrustMatches.Count -ne 1 -or $inMemoryScramMatches.Count -ne 0) {
        throw "TRANSFORMATION ASSERTION FAILED: In-memory modified configuration does not contain exactly 1 temporary trust rule (found: $($inMemoryTrustMatches.Count)) or still contains target SCRAM rule (found: $($inMemoryScramMatches.Count)). Aborting before modifying '$pgHba'."
    }

    # Write modified configuration to disk
    Write-Host "[CONFIG] Writing temporary local trust authentication to '$pgHba'..."
    Set-Content -Path $pgHba -Value $modifiedContent -NoNewline

    # Post-write on-disk assertion before service restart
    $writtenContent = Get-Content -Path $pgHba -Raw
    $diskTrustMatches = [regex]::Matches($writtenContent, $targetTrustPattern)
    $diskScramMatches = [regex]::Matches($writtenContent, $targetScramPattern)

    if ($diskTrustMatches.Count -ne 1 -or $diskScramMatches.Count -ne 0) {
        # Immediate rollback if on-disk verification fails
        Copy-Item -Path $pgHbaBak -Destination $pgHba -Force
        throw "DISK WRITE ASSERTION FAILED: Disk content does not contain exactly 1 temporary trust rule (found: $($diskTrustMatches.Count)). Rolled back to original backup immediately. PostgreSQL service was NOT restarted."
    }

    Write-Host "[CONFIG] Verified on-disk configuration contains exactly 1 temporary localhost trust rule. Restarting PostgreSQL service..."
    Restart-Service -Name "postgresql-x64-18" -ErrorAction Stop

    Write-Host "[AUDIT] Executing live PostgreSQL concurrency test suite..."
    node src/scripts/test_postgres_live_concurrency.mjs
    $testExitCode = $LASTEXITCODE
    if ($testExitCode -ne 0) {
        throw "Live PostgreSQL test script failed with exit code $testExitCode"
    }
}
finally {
    # 4 & 5. Restoration block: Restore original backup, restart PostgreSQL,
    # verify parsed active configuration using pg_hba_file_rules where possible,
    # and NEVER delete the backup if restoration or verification fails.
    if ($backupCreated) {
        Write-Host "[RESTORE] Beginning restoration of original secure pg_hba.conf..."
        $restorationVerified = $false

        try {
            if (-not (Test-Path $pgHbaBak)) {
                throw "CRITICAL RECOVERY ERROR: Backup file '$pgHbaBak' was unexpectedly missing during restoration block!"
            }

            # 1. Restore the original backup file over pg_hba.conf
            Copy-Item -Path $pgHbaBak -Destination $pgHba -Force

            # 2. Cryptographic SHA-256 verification of restored file against original backup
            $restoredHash = (Get-FileHash -Path $pgHba -Algorithm SHA256).Hash
            if ($restoredHash -ne $backupHash) {
                throw "INTEGRITY ERROR: SHA256 hash of restored '$pgHba' ($restoredHash) does not match original backup ($backupHash)!"
            }

            # 3. Static check: scan entire restored file for any un-commented 'trust' rules
            $restoredContent = Get-Content -Path $pgHba -Raw
            $uncommentedTrust = [regex]::Matches($restoredContent, "(?m)^[ \t]*host[^\r\n]*\btrust\b")
            $originalTrust = [regex]::Matches($activeContent, "(?m)^[ \t]*host[^\r\n]*\btrust\b")
            if ($uncommentedTrust.Count -gt $originalTrust.Count) {
                throw "SECURITY AUDIT FAILED: Restored pg_hba.conf contains $($uncommentedTrust.Count) un-commented trust rule(s), exceeding original count of $($originalTrust.Count)!"
            }

            # 4. Restart PostgreSQL service to apply restored authentication
            Write-Host "[RESTORE] Restarting PostgreSQL service to apply restored secure configuration..."
            Restart-Service -Name "postgresql-x64-18" -ErrorAction Stop

            # 5. Live verification using pg_hba_file_rules and SHOW hba_file
            Write-Host "[RESTORE] Verifying parsed active rules via PostgreSQL SHOW hba_file and pg_hba_file_rules..."
            $nodeVerificationScript = @'
import { Client } from 'pg';
import path from 'path';
import net from 'net';

const expectedHbaPath = process.argv[2];
if (!expectedHbaPath) {
  console.error('VERIFICATION_CONFIG_ERROR: Expected pg_hba.conf path parameter is missing.');
  process.exit(1);
}

function parseIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
  return (BigInt(parts[0]) << 24n) | (BigInt(parts[1]) << 16n) | (BigInt(parts[2]) << 8n) | BigInt(parts[3]);
}

function parseIPv6(ip) {
  let s = ip.trim().toLowerCase();
  if (s.includes('.')) {
    const lastColon = s.lastIndexOf(':');
    const v4Part = s.slice(lastColon + 1);
    const v4Num = parseIPv4(v4Part);
    if (v4Num === null) return null;
    const hi = ((v4Num >> 16n) & 0xffffn).toString(16);
    const lo = (v4Num & 0xffffn).toString(16);
    s = s.slice(0, lastColon) + ':' + hi + ':' + lo;
  }
  const parts = s.split('::');
  if (parts.length > 2) return null;
  let left = parts[0] ? parts[0].split(':') : [];
  let right = parts[1] ? parts[1].split(':') : [];
  if (parts.length === 1 && left.length !== 8) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 0) return null;
  const full = [...left, ...Array(missing).fill('0'), ...right];
  if (full.length !== 8) return null;
  let val = 0n;
  for (const h of full) {
    const n = parseInt(h || '0', 16);
    if (isNaN(n) || n < 0 || n > 0xffff) return null;
    val = (val << 16n) | BigInt(n);
  }
  return val;
}

function netmaskToPrefix(netmaskStr, isV6) {
  if (!netmaskStr) return null;
  const clean = netmaskStr.trim();
  if (/^\d+$/.test(clean)) return parseInt(clean, 10);
  if (isV6) {
    const val = parseIPv6(clean);
    if (val === null) return null;
    let count = 0;
    for (let i = 127n; i >= 0n; i--) {
      if ((val & (1n << i)) !== 0n) count++;
      else break;
    }
    return count;
  } else {
    const val = parseIPv4(clean);
    if (val === null) return null;
    let count = 0;
    for (let i = 31n; i >= 0n; i--) {
      if ((val & (1n << i)) !== 0n) count++;
      else break;
    }
    return count;
  }
}

function cidrContains(cidrStr, targetIpStr) {
  let [netStr, maskStr] = cidrStr.split('/');
  netStr = netStr.trim();
  const v4Net = net.isIPv4(netStr);
  const v6Net = net.isIPv6(netStr);
  const v4Target = net.isIPv4(targetIpStr);
  const v6Target = net.isIPv6(targetIpStr);

  if (v4Net && v4Target) {
    const netVal = parseIPv4(netStr);
    const targetVal = parseIPv4(targetIpStr);
    if (netVal === null || targetVal === null) return false;
    let prefix = maskStr !== undefined ? parseInt(maskStr, 10) : 32;
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
    const mask = prefix === 0 ? 0n : ((~0n << BigInt(32 - prefix)) & 0xffffffffn);
    return (netVal & mask) === (targetVal & mask);
  }
  if (v6Net && v6Target) {
    const netVal = parseIPv6(netStr);
    const targetVal = parseIPv6(targetIpStr);
    if (netVal === null || targetVal === null) return false;
    let prefix = maskStr !== undefined ? parseInt(maskStr, 10) : 128;
    if (isNaN(prefix) || prefix < 0 || prefix > 128) return false;
    const mask = prefix === 0 ? 0n : ((~0n << BigInt(128 - prefix)) & ((1n << 128n) - 1n));
    return (netVal & mask) === (targetVal & mask);
  }
  return false;
}

function ruleAffectsLocalAuditOrIsBroad(r) {
  if (r.auth_method !== 'trust') return false;

  const type = (r.type || '').trim().toLowerCase();
  const addr = (r.address || '').trim().toLowerCase();
  const netmask = (r.netmask || '').trim().toLowerCase();

  const isKeywordBroad = ['all', 'samehost', 'samenet', 'localhost'].includes(addr);
  let coversLoopback = false;
  let isBroadCidr = false;

  if (addr) {
    let effectiveCidr = addr;
    if (!effectiveCidr.includes('/') && netmask) {
      const isV6 = net.isIPv6(effectiveCidr);
      const prefix = netmaskToPrefix(netmask, isV6);
      if (prefix !== null) effectiveCidr = effectiveCidr + '/' + prefix;
    }

    if (cidrContains(effectiveCidr, '127.0.0.1') ||
        cidrContains(effectiveCidr, '::1') ||
        cidrContains(effectiveCidr, '::ffff:127.0.0.1')) {
      coversLoopback = true;
    }

    // Broad ranges covering all IPv4 or all IPv6
    if (cidrContains(effectiveCidr, '0.0.0.0') && cidrContains(effectiveCidr, '255.255.255.255')) {
      isBroadCidr = true;
    }
    if (cidrContains(effectiveCidr, '::') && cidrContains(effectiveCidr, 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')) {
      isBroadCidr = true;
    }
  }

  // Database applicability
  const dbList = Array.isArray(r.database) ? r.database : [r.database || 'all'];
  const affectsAuditDb = dbList.some(db => 
    db === 'all' || db === 'postgres' || db === 'sameuser' || db.startsWith('disposable_audit_live_test')
  );

  // User applicability
  const userList = Array.isArray(r.user_name) ? r.user_name : [r.user_name || 'all'];
  const affectsAuditUser = userList.some(u => 
    u === 'all' || u === 'postgres' || u.startsWith('+')
  );

  // Condition 1: Any broad trust rule (e.g. 0.0.0.0/0, ::/0, all, samehost, samenet)
  if (isKeywordBroad || isBroadCidr) return true;

  // Condition 2: Local domain socket trust rule affecting target db/user
  if (type === 'local' && affectsAuditDb && affectsAuditUser) return true;

  // Condition 3: TCP trust rule covering loopback that affects target db/user
  if (type.startsWith('host') && coversLoopback && affectsAuditDb && affectsAuditUser) return true;

  // Condition 4: Any trust rule that explicitly specifies a loopback address regardless of db/user restrictions
  if (coversLoopback) return true;

  return false;
}

function formatRule(r) {
  const dbStr = Array.isArray(r.database) ? r.database.join(',') : (r.database || 'all');
  const userStr = Array.isArray(r.user_name) ? r.user_name.join(',') : (r.user_name || 'all');
  return `Line ${r.line_number}: type=${r.type}, address=${r.address || 'N/A'}, database=[${dbStr}], user=[${userStr}], auth_method=${r.auth_method}`;
}

const client = new Client({
  host: '127.0.0.1',
  port: 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'postgres',
  connectionTimeoutMillis: 5000
});

async function verify() {
  try {
    await client.connect();

    // 1. Verify active configuration file via SHOW hba_file
    const hbaFileRes = await client.query('SHOW hba_file;');
    const activeHbaFile = hbaFileRes.rows[0]?.hba_file;
    if (!activeHbaFile) {
      console.error('VERIFICATION_ERROR: SHOW hba_file returned no result.');
      process.exit(1);
    }

    const normalizedExpected = path.resolve(expectedHbaPath).toLowerCase().replace(/\\/g, '/');
    const normalizedActive = path.resolve(activeHbaFile).toLowerCase().replace(/\\/g, '/');

    if (normalizedExpected !== normalizedActive) {
      console.error(`HBA_FILE_MISMATCH: PostgreSQL is actively using '${activeHbaFile}', expected '${expectedHbaPath}'.`);
      process.exit(1);
    }

    // 2. Query parsed rules and verify no configuration/parse errors
    const rulesRes = await client.query(
      'SELECT line_number, type, database, user_name, address, netmask, auth_method, options, error FROM pg_hba_file_rules ORDER BY line_number;'
    );

    const rulesWithErrors = rulesRes.rows.filter(r => r.error !== null && r.error !== undefined && r.error !== '');
    if (rulesWithErrors.length > 0) {
      const errorMessages = rulesWithErrors.map(r => `Line ${r.line_number}: ${r.error}`).join('; ');
      console.error(`HBA_RULE_PARSE_ERRORS: PostgreSQL reported configuration parse error(s) in '${activeHbaFile}': ${errorMessages}`);
      process.exit(1);
    }

    // 3. Inspect every successfully parsed trust rule
    const allTrustRules = rulesRes.rows.filter(r => r.auth_method === 'trust');
    const unintendedTrustRules = allTrustRules.filter(ruleAffectsLocalAuditOrIsBroad);

    if (unintendedTrustRules.length > 0) {
      const formatted = unintendedTrustRules.map(formatRule).join('\n  ');
      console.error(`UNINTENDED_TRUST_RULES_DETECTED: Found ${unintendedTrustRules.length} matching trust rule(s):\n  ${formatted}`);
      process.exit(1);
    }

    await client.end();
    console.log(`OK:ENGINE_VERIFIED [hba_file: ${activeHbaFile}, total_rules: ${rulesRes.rows.length}, active_trust_rules: 0]`);
    process.exit(0);
  } catch (err) {
    // Authentication failure or connection refusal cannot be assumed to prove SCRAM.
    // Inconclusive or unavailable engine-level verification is treated as a verification failure.
    console.error(`ENGINE_VERIFICATION_FAILED: Engine verification was inconclusive or unavailable: ${err.message} (code: ${err.code || 'UNKNOWN'}). Active authenticated engine verification is required.`);
    try { await client.end(); } catch (_) {}
    process.exit(1);
  }
}

verify();
'@
            $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
            if (-not $scriptDir) { $scriptDir = $PSScriptRoot }
            if (-not $scriptDir) { $scriptDir = (Get-Location).Path }
            $tempNodeScript = [System.IO.Path]::Combine($scriptDir, ".verify_hba_probe_" + [System.Guid]::NewGuid().ToString("N") + ".mjs")
            try {
                [System.IO.File]::WriteAllText($tempNodeScript, $nodeVerificationScript)
                $verifyOutput = & node $tempNodeScript "$pgHba" 2>&1
                $verifyExitCode = $LASTEXITCODE

                if ($verifyExitCode -eq 0) {
                    Write-Host "[RESTORE] Engine verification confirmed ($verifyOutput)."
                } else {
                    $formattedOutput = ($verifyOutput | Out-String).Trim()
                    throw "Engine verification failed (exit code $verifyExitCode):`n$formattedOutput"
                }
            } finally {
                if (Test-Path $tempNodeScript) {
                    Remove-Item -Path $tempNodeScript -Force -ErrorAction SilentlyContinue
                }
            }

            # 6. Mark restoration as fully verified
            $restorationVerified = $true

            # 7. Only delete the backup if restoration AND verification fully succeeded
            Remove-Item -Path $pgHbaBak -Force
            Write-Host "[SUCCESS] Original pg_hba.conf successfully restored, verified, and PostgreSQL restarted. Backup removed cleanly."
        } catch {
            $errMsg = $_.Exception.Message
            [Console]::Error.WriteLine("================================================================================")
            [Console]::Error.WriteLine("CRITICAL SECURITY RESTORATION FAILURE")
            [Console]::Error.WriteLine("Failed to restore or verify secure PostgreSQL authentication configuration.")
            [Console]::Error.WriteLine("Error: $errMsg")
            [Console]::Error.WriteLine("")
            [Console]::Error.WriteLine("CRITICAL SAFETY ACTION TAKEN:")
            [Console]::Error.WriteLine("  The original backup file '$pgHbaBak' HAS BEEN PRESERVED. It was NOT deleted.")
            [Console]::Error.WriteLine("MANUAL RECOVERY INSTRUCTIONS:")
            [Console]::Error.WriteLine("  1. Copy '$pgHbaBak' over '$pgHba' manually.")
            [Console]::Error.WriteLine("  2. Restart PostgreSQL: Restart-Service postgresql-x64-18")
            [Console]::Error.WriteLine("  3. Delete '$pgHbaBak' once verified.")
            [Console]::Error.WriteLine("================================================================================")
            exit 1
        }
    }
}
