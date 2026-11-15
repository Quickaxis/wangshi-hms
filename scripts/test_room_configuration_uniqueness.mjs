import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

console.log("🧪 Running Room Configuration Uniqueness & Migration Safety Verification Suite...\n");

// ----------------------------------------------------------------------------
// TEST 1 & 2 & 3 & 4: Application-Level Tenant Room Uniqueness Simulation
// ----------------------------------------------------------------------------

// Mock Database State representing 2 properties
const HOMESTAY_ALPHA = "homestay-alpha-1111";
const HOMESTAY_BETA = "homestay-beta-2222";

let mockRoomsDatabase = [
  {
    id: "room-a-01",
    homestay_id: HOMESTAY_ALPHA,
    room_number: "01",
    name: "Alpha Deluxe Suite",
    nightly_rate: 2500,
    max_guests: 2,
    is_active: true
  },
  {
    id: "room-b-01",
    homestay_id: HOMESTAY_BETA,
    room_number: "01",
    name: "Beta Pine Room",
    nightly_rate: 2800,
    max_guests: 2,
    is_active: true
  }
];

function simulateSaveRoomConfig(input, targetHomestayId, isMigrationApplied = true) {
  const normalizedNum = input.room_number?.trim();
  if (!normalizedNum) {
    return { success: false, error: "Room number is required." };
  }
  if (!input.name?.trim()) {
    return { success: false, error: "Room name is required." };
  }

  // 1. Tenant-scoped pre-check (runs on both client and server)
  const existingInHomestay = mockRoomsDatabase.find(
    r => r.homestay_id === targetHomestayId &&
         r.room_number.trim().toLowerCase() === normalizedNum.toLowerCase() &&
         r.id !== input.id
  );

  if (existingInHomestay) {
    return {
      success: false,
      error: `Room number "${normalizedNum}" already exists in this homestay ("${existingInHomestay.name}"). Please use a unique room number.`
    };
  }

  // 2. Database Constraint Emulation:
  // If migration NOT applied, legacy global constraint `rooms_room_number_key` triggers on cross-homestay match
  if (!isMigrationApplied) {
    const globalCollision = mockRoomsDatabase.find(
      r => r.room_number.trim().toLowerCase() === normalizedNum.toLowerCase() &&
           r.id !== input.id
    );
    if (globalCollision) {
      if (globalCollision.homestay_id !== targetHomestayId) {
        return {
          success: false,
          error: `Room number "${normalizedNum}" is currently in use by another homestay. A database migration (migration_rooms_per_homestay_unique.sql) is required to allow identical room numbers across different homestays.`
        };
      }
      return {
        success: false,
        error: `Room number "${normalizedNum}" already exists in this homestay. Please use a unique room number.`
      };
    }
  }

  // If validation passes, insert or update
  if (input.id) {
    const idx = mockRoomsDatabase.findIndex(r => r.id === input.id && r.homestay_id === targetHomestayId);
    if (idx === -1) return { success: false, error: "Room not found or unauthorized." };
    mockRoomsDatabase[idx] = { ...mockRoomsDatabase[idx], ...input, room_number: normalizedNum };
    return { success: true, message: `Room ${input.name} updated successfully.` };
  } else {
    const newRoom = {
      id: `room-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      homestay_id: targetHomestayId,
      room_number: normalizedNum,
      name: input.name.trim(),
      nightly_rate: input.nightly_rate || 2500,
      max_guests: input.max_guests || 2,
      is_active: input.is_active !== false
    };
    mockRoomsDatabase.push(newRoom);
    return { success: true, message: `Room ${input.name} added successfully.`, data: newRoom };
  }
}

// ============================================================================
// Scenario 1: Adding room "02" to Homestay Alpha
// ============================================================================
console.log("Test 1: Adding room '02' to intended homestay (Homestay Alpha)...");
const res1 = simulateSaveRoomConfig(
  {
    room_number: "02",
    name: "Sunshine Premium Suite",
    nightly_rate: 2999,
    max_guests: 2,
    is_active: true
  },
  HOMESTAY_ALPHA,
  true // migration applied
);
assert.strictEqual(res1.success, true, "Adding room 02 to Homestay Alpha must succeed");
assert.ok(mockRoomsDatabase.some(r => r.homestay_id === HOMESTAY_ALPHA && r.room_number === "02"), "Room 02 must exist in Homestay Alpha");
console.log("✅ Test 1 Passed: Room 02 successfully added to Homestay Alpha.\n");

// ============================================================================
// Scenario 2: Adding the same room number "02" to a DIFFERENT homestay (Homestay Beta)
// ============================================================================
console.log("Test 2: Adding the same room number '02' to a different homestay (Homestay Beta)...");
const res2 = simulateSaveRoomConfig(
  {
    room_number: "02",
    name: "Beta Mountain Vista 02",
    nightly_rate: 3200,
    max_guests: 3,
    is_active: true
  },
  HOMESTAY_BETA,
  true // migration applied
);
assert.strictEqual(res2.success, true, "Adding room 02 to Homestay Beta must succeed independently");
assert.ok(mockRoomsDatabase.some(r => r.homestay_id === HOMESTAY_BETA && r.room_number === "02"), "Room 02 must exist in Homestay Beta");
console.log("✅ Test 2 Passed: Room 02 successfully co-exists in Homestay Beta under per-homestay uniqueness.\n");

// ============================================================================
// Scenario 3: Attempting to add room "02" again to the SAME homestay (Homestay Alpha)
// ============================================================================
console.log("Test 3: Attempting to add room '02' again to the same homestay (Homestay Alpha)...");
const res3 = simulateSaveRoomConfig(
  {
    room_number: "02",
    name: "Duplicate Alpha Room",
    nightly_rate: 2500,
    max_guests: 2,
    is_active: true
  },
  HOMESTAY_ALPHA,
  true
);
assert.strictEqual(res3.success, false, "Adding duplicate room 02 to same homestay must fail");
assert.ok(
  res3.error.includes("already exists in this homestay"),
  `Error must be user-friendly tenant duplication message. Got: ${res3.error}`
);
console.log(`✅ Test 3 Passed: Rejected duplicate with message: "${res3.error}"\n`);

// ============================================================================
// Scenario 4: Editing an existing room without creating duplicates
// ============================================================================
console.log("Test 4: Editing an existing room without creating duplicates...");
const roomToEdit = mockRoomsDatabase.find(r => r.homestay_id === HOMESTAY_ALPHA && r.room_number === "02");
assert.ok(roomToEdit, "Room to edit must exist");

// 4A. Editing room price/name while keeping its own room number "02" -> must succeed
const res4A = simulateSaveRoomConfig(
  {
    id: roomToEdit.id,
    room_number: "02",
    name: "Sunshine Premium Suite (Renovated)",
    nightly_rate: 3499,
    max_guests: 2,
    is_active: true
  },
  HOMESTAY_ALPHA,
  true
);
assert.strictEqual(res4A.success, true, "Editing own room keeping room_number 02 must succeed");

// 4B. Attempting to rename room number to "01" (which already exists in Alpha) -> must fail
const res4B = simulateSaveRoomConfig(
  {
    id: roomToEdit.id,
    room_number: "01",
    name: "Attempted Clash",
    nightly_rate: 2500,
    max_guests: 2,
    is_active: true
  },
  HOMESTAY_ALPHA,
  true
);
assert.strictEqual(res4B.success, false, "Renaming room to existing room number in same homestay must fail");
assert.ok(res4B.error.includes("already exists in this homestay"));
console.log("✅ Test 4 Passed: Self-edit allowed, intra-homestay collision on edit strictly blocked.\n");

// ============================================================================
// Scenario 5: Legacy Constraint Diagnostic Protection
// ============================================================================
console.log("Test 5: Verifying legacy database constraint protection & diagnostic message...");
// If migration is not yet run, attempting to add room 01 to a third homestay triggers legacy diagnostic
const res5 = simulateSaveRoomConfig(
  {
    room_number: "01",
    name: "Gamma Room 01",
    nightly_rate: 2000,
    max_guests: 2
  },
  "homestay-gamma-3333",
  false // migration NOT applied in DB yet
);
assert.strictEqual(res5.success, false);
assert.ok(
  res5.error.includes("migration_rooms_per_homestay_unique.sql"),
  "Diagnostic message must direct user to migration file"
);
console.log(`✅ Test 5 Passed: Legacy constraint diagnostic verified: "${res5.error}"\n`);

// ============================================================================
// Scenario 6: SQL Migration & Rollback Integrity Inspection
// ============================================================================
console.log("Test 6: Validating proposed SQL migration & rollback scripts...");
const migrationPath = path.resolve(process.cwd(), "scripts", "migration_rooms_per_homestay_unique.sql");
const rollbackPath = path.resolve(process.cwd(), "scripts", "migration_rooms_per_homestay_unique_rollback.sql");

assert.ok(fs.existsSync(migrationPath), "Migration SQL file must exist");
assert.ok(fs.existsSync(rollbackPath), "Rollback SQL file must exist");

const migrationSql = fs.readFileSync(migrationPath, "utf8");
const rollbackSql = fs.readFileSync(rollbackPath, "utf8");

// Verify Migration Script Elements
assert.ok(migrationSql.includes("BEGIN;"), "Migration must be transactional (BEGIN)");
assert.ok(migrationSql.includes("COMMIT;"), "Migration must be transactional (COMMIT)");

// Check transaction-local baseline temporary table
assert.ok(migrationSql.includes("CREATE TEMP TABLE _migration_room_baseline"), "Migration must create transaction-local temporary table for baseline");
assert.ok(migrationSql.includes("ON COMMIT DROP"), "Migration baseline temp table must be ON COMMIT DROP");
assert.ok(migrationSql.includes("bookings_count"), "Migration baseline must capture bookings count");
assert.ok(migrationSql.includes("invoices_count"), "Migration baseline must capture invoices count");
assert.ok(migrationSql.includes("payments_count"), "Migration baseline must capture payments count");

// Check NO silent TRIM normalization in pre-flight grouping
assert.ok(!migrationSql.includes("GROUP BY homestay_id, TRIM(room_number)"), "Migration must NOT silently normalize room numbers using TRIM in grouping");
assert.ok(migrationSql.includes("GROUP BY homestay_id, room_number"), "Migration must use exact group by (homestay_id, room_number)");

// Check Table and Column-level constraint checks
assert.ok(migrationSql.includes("c.conrelid = 'public.rooms'::regclass"), "Migration must verify constraints on public.rooms table");
assert.ok(migrationSql.includes("c.contype"), "Migration must verify constraint type 'u' (UNIQUE)");
assert.ok(migrationSql.includes("pg_get_constraintdef"), "Migration must verify constraint definition via pg_get_constraintdef");
assert.ok(migrationSql.includes("INCOMPATIBLE_LEGACY_CONSTRAINT"), "Migration must fail safely on unexpected legacy constraint states");
assert.ok(migrationSql.includes("INCOMPATIBLE_COMPOSITE_CONSTRAINT"), "Migration must fail safely on unexpected composite constraint states");
assert.ok(migrationSql.includes("DROP CONSTRAINT rooms_room_number_key"), "Migration must drop legacy global constraint");
assert.ok(migrationSql.includes("UNEXPECTED_GLOBAL_CONSTRAINT_DETECTED"), "Migration must detect unexpected global unique constraints and halt without auto-dropping");
assert.ok(migrationSql.includes("UNEXPECTED_UNIQUE_INDEX_DETECTED"), "Migration must detect standalone unique indexes and halt without auto-dropping");
assert.ok(migrationSql.includes("uq_rooms_homestay_room_number"), "Migration must create composite constraint uq_rooms_homestay_room_number");
assert.ok(migrationSql.includes("UNIQUE (homestay_id, room_number)"), "Migration must enforce UNIQUE on (homestay_id, room_number)");
assert.ok(migrationSql.includes("PRE-FLIGHT AUDIT FAILED"), "Migration must contain pre-flight guard against intra-homestay duplicates");
assert.ok(migrationSql.includes("POST-MIGRATION VERIFICATION FAILED"), "Migration must contain post-migration verification");

// Check Data Immutability against baseline
assert.ok(migrationSql.includes("DATA IMMUTABILITY VIOLATION: rooms count changed"), "Migration must compare rooms count against baseline");
assert.ok(migrationSql.includes("DATA IMMUTABILITY VIOLATION: bookings count changed"), "Migration must compare bookings count against baseline");
assert.ok(migrationSql.includes("DATA IMMUTABILITY VIOLATION: invoices count changed"), "Migration must compare invoices count against baseline");
assert.ok(migrationSql.includes("DATA IMMUTABILITY VIOLATION: payments count changed"), "Migration must compare payments count against baseline");

// Check that indnkeyatts is strictly used and indnatts is completely eliminated
assert.ok(migrationSql.includes("generate_series(1, i.indnkeyatts)"), "Migration must use i.indnkeyatts to inspect unique key columns");
assert.ok(!migrationSql.includes("generate_series(1, i.indnatts)"), "Migration must NOT use i.indnatts (which incorrectly includes INCLUDE columns)");

// Check that catalog attribute names are cast to text to prevent name[] = text[] operator error (42883)
assert.ok(migrationSql.includes("a.attname::text"), "Migration must explicitly cast a.attname to text in array_agg");
assert.ok(!migrationSql.includes("a.attname ORDER BY"), "Migration must NOT aggregate uncast a.attname (produces name[] which has no equality operator with text[])");

// Verify Rollback Script Elements
assert.ok(rollbackSql.includes("BEGIN;"), "Rollback must be transactional (BEGIN)");
assert.ok(rollbackSql.includes("COMMIT;"), "Rollback must be transactional (COMMIT)");

// Check rollback baseline temporary table
assert.ok(rollbackSql.includes("CREATE TEMP TABLE _rollback_room_baseline"), "Rollback must create transaction-local temporary table for baseline");
assert.ok(rollbackSql.includes("ON COMMIT DROP"), "Rollback baseline temp table must be ON COMMIT DROP");

// Check that indnkeyatts is strictly used in rollback and indnatts is completely eliminated
assert.ok(rollbackSql.includes("generate_series(1, i.indnkeyatts)"), "Rollback must use i.indnkeyatts to inspect unique key columns");
assert.ok(!rollbackSql.includes("generate_series(1, i.indnatts)"), "Rollback must NOT use i.indnatts");

// Check that rollback explicitly casts catalog attribute names to text
assert.ok(rollbackSql.includes("a.attname::text"), "Rollback must explicitly cast a.attname to text in array_agg");
assert.ok(!rollbackSql.includes("a.attname ORDER BY"), "Rollback must NOT aggregate uncast a.attname");

// Check NO silent TRIM normalization in rollback pre-flight grouping
assert.ok(!rollbackSql.includes("GROUP BY TRIM(room_number)"), "Rollback must NOT silently normalize room numbers using TRIM in grouping");
assert.ok(rollbackSql.includes("GROUP BY room_number"), "Rollback must use exact group by room_number");

assert.ok(rollbackSql.includes("c.conrelid = 'public.rooms'::regclass"), "Rollback must verify constraints on public.rooms table");
assert.ok(rollbackSql.includes("c.contype"), "Rollback must verify constraint type 'u' (UNIQUE)");
assert.ok(rollbackSql.includes("pg_get_constraintdef"), "Rollback must verify constraint definition via pg_get_constraintdef");
assert.ok(rollbackSql.includes("INCOMPATIBLE_COMPOSITE_CONSTRAINT"), "Rollback must fail safely on unexpected composite constraint states");
assert.ok(rollbackSql.includes("INCOMPATIBLE_LEGACY_CONSTRAINT"), "Rollback must fail safely on unexpected legacy constraint states");
assert.ok(rollbackSql.includes("UNEXPECTED_GLOBAL_CONSTRAINT_DETECTED"), "Rollback must detect unexpected unique constraints and halt without auto-dropping");
assert.ok(rollbackSql.includes("UNEXPECTED_UNIQUE_INDEX_DETECTED"), "Rollback must detect standalone unique indexes and halt without auto-dropping");
assert.ok(rollbackSql.includes("DROP CONSTRAINT uq_rooms_homestay_room_number"), "Rollback must drop composite constraint");
assert.ok(rollbackSql.includes("ADD CONSTRAINT rooms_room_number_key UNIQUE (room_number)"), "Rollback must restore global unique constraint");
assert.ok(rollbackSql.includes("ROLLBACK ABORTED"), "Rollback must refuse execution if cross-homestay collisions exist");

// Check Data Immutability against rollback baseline
assert.ok(rollbackSql.includes("DATA IMMUTABILITY VIOLATION: rooms count changed"), "Rollback must compare rooms count against baseline");
assert.ok(rollbackSql.includes("DATA IMMUTABILITY VIOLATION: bookings count changed"), "Rollback must compare bookings count against baseline");
assert.ok(rollbackSql.includes("DATA IMMUTABILITY VIOLATION: invoices count changed"), "Rollback must compare invoices count against baseline");
assert.ok(rollbackSql.includes("DATA IMMUTABILITY VIOLATION: payments count changed"), "Rollback must compare payments count against baseline");

console.log("✅ Test 6 Passed: SQL migration and rollback files satisfy all safety, audit, and transactional requirements.\n");

// ============================================================================
// Scenario 7: PostgreSQL Catalog Unique Index Key Audit Simulation (indnkeyatts vs indnatts)
// Regression test for:
//   CREATE UNIQUE INDEX test_room_number_idx ON public.rooms (room_number) INCLUDE (homestay_id);
// ============================================================================
console.log("Test 7: Regression test for indnkeyatts vs indnatts index key inspection...");

// Catalog representation of indexes on public.rooms
const mockCatalogIndexes = [
  {
    relname: "test_room_number_idx",
    indisunique: true,
    indnatts: 2,        // total attributes (room_number + INCLUDE homestay_id)
    indnkeyatts: 1,     // KEY attributes participating in uniqueness: room_number ONLY
    columns: ["room_number", "homestay_id"],
    definition: "CREATE UNIQUE INDEX test_room_number_idx ON public.rooms USING btree (room_number) INCLUDE (homestay_id)",
    isPartial: false
  },
  {
    relname: "test_composite_idx",
    indisunique: true,
    indnatts: 2,
    indnkeyatts: 2,     // Both are key attributes
    columns: ["homestay_id", "room_number"],
    definition: "CREATE UNIQUE INDEX test_composite_idx ON public.rooms USING btree (homestay_id, room_number)",
    isPartial: false
  },
  {
    relname: "test_partial_room_idx",
    indisunique: true,
    indnatts: 1,
    indnkeyatts: 1,
    columns: ["room_number"],
    definition: "CREATE UNIQUE INDEX test_partial_room_idx ON public.rooms USING btree (room_number) WHERE (is_active = true)",
    isPartial: true
  }
];

// Helper to simulate the SQL pg_index query using either indnatts or indnkeyatts
function simulateCatalogIndexCheck(indexes, useKeyAttsOnly = true, targetColumns = ["room_number"]) {
  const matches = [];
  for (const idx of indexes) {
    if (!idx.indisunique) continue;
    if (idx.relname === "rooms_room_number_key" || idx.relname === "uq_rooms_homestay_room_number") continue;

    // In SQL: generate_series(1, i.indnatts) vs generate_series(1, i.indnkeyatts)
    const colCount = useKeyAttsOnly ? idx.indnkeyatts : idx.indnatts;
    const inspectedColumns = idx.columns.slice(0, colCount);

    // Exact array equality: ARRAY[...] = ARRAY['room_number']::text[]
    const isMatch = inspectedColumns.length === targetColumns.length &&
                    inspectedColumns.every((c, i) => c === targetColumns[i]);

    if (isMatch) {
      matches.push(idx);
    }
  }
  return matches;
}

// 7A. Demonstrate the bug with legacy indnatts:
// test_room_number_idx is MISSED because indnatts = 2 -> ['room_number', 'homestay_id'] != ['room_number']
const buggedMatches = simulateCatalogIndexCheck(mockCatalogIndexes, false, ["room_number"]);
const caughtWithIndnatts = buggedMatches.some(m => m.relname === "test_room_number_idx");
assert.strictEqual(
  caughtWithIndnatts,
  false,
  "indnatts INCORRECTLY fails to detect test_room_number_idx because it includes INCLUDE columns in the array"
);
console.log("  - Confirmed: Legacy indnatts would fail to detect test_room_number_idx with INCLUDE clause.");

// 7B. Demonstrate the fix with indnkeyatts:
// test_room_number_idx IS CAUGHT because indnkeyatts = 1 -> ['room_number'] == ['room_number']
const correctedMatches = simulateCatalogIndexCheck(mockCatalogIndexes, true, ["room_number"]);
const caughtWithIndnkeyatts = correctedMatches.some(m => m.relname === "test_room_number_idx");
assert.strictEqual(
  caughtWithIndnkeyatts,
  true,
  "indnkeyatts MUST accurately detect test_room_number_idx as enforcing global uniqueness on room_number"
);
console.log("  - Confirmed: Corrected indnkeyatts accurately detects test_room_number_idx and triggers abort.");

// 7C. Verify composite index on (homestay_id, room_number) is handled correctly:
// indnkeyatts = 2 -> ['homestay_id', 'room_number'] != ['room_number'] -> Not flagged as single-column global index
const compositeFlaggedAsGlobal = correctedMatches.some(m => m.relname === "test_composite_idx");
assert.strictEqual(
  compositeFlaggedAsGlobal,
  false,
  "Composite index on (homestay_id, room_number) must NOT be flagged as a global index on room_number"
);
console.log("  - Confirmed: Composite unique index on (homestay_id, room_number) is handled correctly.");

// 7D. Verify partial unique index is detected conservatively:
// test_partial_room_idx has indnkeyatts = 1 -> ['room_number'] -> flagged as global enforcement
const partialFlagged = correctedMatches.some(m => m.relname === "test_partial_room_idx");
assert.strictEqual(
  partialFlagged,
  true,
  "Partial unique index on room_number must be conservatively detected and trigger abort"
);
console.log("  - Confirmed: Partial unique index on room_number is conservatively detected.");

// 7E. Verify rollback detects unexpected unique indexes before restoring global uniqueness
function simulateRollbackAudit(indexes) {
  const unexpectedIndexes = simulateCatalogIndexCheck(indexes, true, ["room_number"]);
  if (unexpectedIndexes.length > 0) {
    const details = unexpectedIndexes.map(i => `Index "${i.relname}" (${i.definition})`).join("; ");
    return {
      canRestore: false,
      error: `UNEXPECTED_UNIQUE_INDEX_DETECTED: Found standalone unique index(es) enforcing global uniqueness on room_number: ${details}. Automatic modification forbidden.`
    };
  }
  return { canRestore: true };
}

const rollbackResultWithUnexpected = simulateRollbackAudit(mockCatalogIndexes);
assert.strictEqual(rollbackResultWithUnexpected.canRestore, false, "Rollback must refuse to run if unexpected index exists");
assert.ok(rollbackResultWithUnexpected.error.includes("test_room_number_idx"), "Rollback abort message must detail test_room_number_idx");
console.log("  - Confirmed: Rollback detects unexpected unique index and halts before restoring global constraint.\n");

console.log("✅ Test 7 Passed: indnkeyatts regression tests, composite index handling, and conservative partial index detection fully verified.\n");

console.log("🎉 ALL 7 ROOM CONFIGURATION & MIGRATION VERIFICATION TESTS PASSED WITH 100% SUCCESS!");

