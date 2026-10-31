param(
    [string]$PgPassword = $env:PGPASSWORD
)

$ErrorActionPreference = "Stop"

$pgHba = "C:\Program Files\PostgreSQL\18\data\pg_hba.conf"
$pgHbaBak = "C:\Program Files\PostgreSQL\18\data\pg_hba.conf.audit_bak"

if ($PgPassword) {
    $env:PGPASSWORD = $PgPassword
}

Write-Host "================================================================================"
Write-Host "READ-ONLY POSTGRESQL RESTORATION VERIFICATION"
Write-Host "================================================================================"

# 1. Assert required files exist
if (-not (Test-Path $pgHba)) {
    throw "Active configuration file not found at: $pgHba"
}
if (-not (Test-Path $pgHbaBak)) {
    throw "Preserved backup file not found at: $pgHbaBak. Cannot verify hash identity."
}

try {
    # 2. Cryptographic SHA-256 hash identity check
    Write-Host "[1/4] Comparing cryptographic SHA-256 hash of active file vs preserved backup..."
    $activeHash = (Get-FileHash -Path $pgHba -Algorithm SHA256).Hash
    $backupHash = (Get-FileHash -Path $pgHbaBak -Algorithm SHA256).Hash

    if ($activeHash -ne $backupHash) {
        throw "INTEGRITY MISMATCH: Active pg_hba.conf hash ($activeHash) does not match backup hash ($backupHash)!"
    }
    Write-Host "      Active and backup SHA-256 hashes match: $activeHash"

    # 3. Static regex scan for un-commented trust rules in active configuration
    Write-Host "[2/4] Scanning active pg_hba.conf for un-commented trust rules..."
    $activeContent = Get-Content -Path $pgHba -Raw
    $uncommentedTrust = [regex]::Matches($activeContent, "(?m)^[ \t]*host[^\r\n]*\btrust\b")
    if ($uncommentedTrust.Count -gt 0) {
        throw "SECURITY VIOLATION: Active pg_hba.conf contains $($uncommentedTrust.Count) un-commented host trust rule(s)!"
    }
    Write-Host "      Zero un-commented host trust rules found in active pg_hba.conf."

    # 4. Engine verification via Node.js
    Write-Host "[3/4] Performing authenticated engine verification via SHOW hba_file and pg_hba_file_rules..."
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

    if (cidrContains(effectiveCidr, '0.0.0.0') && cidrContains(effectiveCidr, '255.255.255.255')) {
      isBroadCidr = true;
    }
    if (cidrContains(effectiveCidr, '::') && cidrContains(effectiveCidr, 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')) {
      isBroadCidr = true;
    }
  }

  const dbList = Array.isArray(r.database) ? r.database : [r.database || 'all'];
  const affectsAuditDb = dbList.some(db => 
    db === 'all' || db === 'postgres' || db === 'sameuser' || db.startsWith('disposable_audit_live_test')
  );

  const userList = Array.isArray(r.user_name) ? r.user_name : [r.user_name || 'all'];
  const affectsAuditUser = userList.some(u => 
    u === 'all' || u === 'postgres' || u.startsWith('+')
  );

  if (isKeywordBroad || isBroadCidr) return true;
  if (type === 'local' && affectsAuditDb && affectsAuditUser) return true;
  if (type.startsWith('host') && coversLoopback && affectsAuditDb && affectsAuditUser) return true;
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

    // 2. Query parsed rules and verify zero configuration/parse errors
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
    console.error(`ENGINE_VERIFICATION_FAILED: Engine verification was inconclusive or unavailable: ${err.message} (code: ${err.code || 'UNKNOWN'}).`);
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
            Write-Host "      Engine verification succeeded ($verifyOutput)."
        } else {
            $formattedOutput = ($verifyOutput | Out-String).Trim()
            throw "Engine verification failed (exit code $verifyExitCode):`n$formattedOutput"
        }
    } finally {
        if (Test-Path $tempNodeScript) {
            Remove-Item -Path $tempNodeScript -Force -ErrorAction SilentlyContinue
        }
    }

    # 5. Only delete the backup if verification fully succeeded
    Write-Host "[4/4] All verification checks passed. Removing preserved backup '$pgHbaBak'..."
    Remove-Item -Path $pgHbaBak -Force
    Write-Host "================================================================================"
    Write-Host "[SUCCESS] PostgreSQL restoration verified cleanly. Backup removed."
    Write-Host "================================================================================"
}
catch {
    $errMsg = $_.Exception.Message
    [Console]::Error.WriteLine("================================================================================")
    [Console]::Error.WriteLine("VERIFICATION FAILED:")
    [Console]::Error.WriteLine($errMsg)
    [Console]::Error.WriteLine("")
    [Console]::Error.WriteLine("CRITICAL SAFETY GUARD:")
    [Console]::Error.WriteLine("  The backup file '$pgHbaBak' HAS BEEN PRESERVED. It was NOT deleted.")
    [Console]::Error.WriteLine("================================================================================")
    exit 1
}
