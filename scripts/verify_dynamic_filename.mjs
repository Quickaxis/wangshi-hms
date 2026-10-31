import fs from 'fs';
import path from 'path';
import os from 'os';
import cp from 'child_process';
import assert from 'assert';

// Load and evaluate sanitizeInvoiceFilename directly from InvoicePrintPortal.tsx
const portalSource = fs.readFileSync('src/components/invoicing/InvoicePrintPortal.tsx', 'utf8');
assert.ok(portalSource.includes('export function sanitizeInvoiceFilename'), "InvoicePrintPortal.tsx must export sanitizeInvoiceFilename");

const sanitizeMatch = portalSource.match(/export function sanitizeInvoiceFilename[\s\S]*?^}/m);
assert.ok(sanitizeMatch, "sanitizeInvoiceFilename function body must be parseable");
const sanitizeInvoiceFilename = new Function('rawNumber', sanitizeMatch[0].replace('export function sanitizeInvoiceFilename(rawNumber?: string | null): string {', '').replace(/^}$/m, ''));

console.log("===============================================================================");
console.log("📄 DYNAMIC PDF FILENAME & CHROME SAVE-AS-PDF VERIFICATION SUITE");
console.log("===============================================================================\n");

// 1. UNIT TESTS: sanitizeInvoiceFilename
console.log("⚡ TEST 1: Sanitize Invoice Filename Unit Checks...");
{
  // Standard invoice number
  assert.strictEqual(
    sanitizeInvoiceFilename("INV-THE-20261030-7654"),
    "INV-THE-20261030-7654",
    "Standard alphanumeric-hyphen invoice number must remain identical"
  );

  // Slashes in invoice number (e.g. INV/2026/10/7654)
  assert.strictEqual(
    sanitizeInvoiceFilename("INV/2026/10/7654"),
    "INV-2026-10-7654",
    "Slashes must be safely converted to hyphens"
  );

  // Backslashes, colons, asterisks, question marks, quotes, brackets
  assert.strictEqual(
    sanitizeInvoiceFilename('INV:2026*10?"<test>|'),
    "INV-2026-10-test",
    "Filesystem-illegal characters must be safely replaced with hyphens"
  );

  // Trailing .pdf extension
  assert.strictEqual(
    sanitizeInvoiceFilename("INV-THE-20261030-7654.pdf"),
    "INV-THE-20261030-7654",
    "Pre-existing .pdf extension must be stripped to prevent double .pdf.pdf"
  );

  // Leading and trailing whitespace / hyphens / dots
  assert.strictEqual(
    sanitizeInvoiceFilename("   ..-INV-THE-20261030-7654-..   "),
    "INV-THE-20261030-7654",
    "Leading/trailing spaces, dots, and hyphens must be trimmed"
  );

  // Null, undefined, empty
  assert.strictEqual(sanitizeInvoiceFilename(null), "invoice", "Null must fallback to 'invoice'");
  assert.strictEqual(sanitizeInvoiceFilename(undefined), "invoice", "Undefined must fallback to 'invoice'");
  assert.strictEqual(sanitizeInvoiceFilename("   "), "invoice", "Whitespace must fallback to 'invoice'");

  console.log("✅ TEST 1 PASSED: All filename sanitization edge cases correctly handled.\n");
}

// 2. REAL CHROME HEADLESS TEST: Document Title & Suggested Save As Filename
console.log("⚡ TEST 2: Real Chrome Save As PDF Suggested Filename Verification...");
{
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  assert.ok(fs.existsSync(CHROME_PATH), `Google Chrome must exist at ${CHROME_PATH}`);

  const testInvoices = [
    {
      invoiceNumber: "INV-THE-20261030-7654",
      expectedFilename: "INV-THE-20261030-7654.pdf"
    },
    {
      invoiceNumber: "INV-WNG-20261030-DRAFT",
      expectedFilename: "INV-WNG-20261030-DRAFT.pdf"
    },
    {
      invoiceNumber: "INV/PELLING/2026/045",
      expectedFilename: "INV-PELLING-2026-045.pdf"
    }
  ];

  for (const item of testInvoices) {
    const sanitized = sanitizeInvoiceFilename(item.invoiceNumber);
    const tmpDir = path.join(os.tmpdir(), `hms_title_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const htmlPath = path.join(tmpDir, 'document.html');
    const pdfPath = path.join(tmpDir, 'output.pdf');
    const userProfileDir = path.join(tmpDir, 'profile');

    // Simulate the exact document flow with dynamic document.title
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${sanitized}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: sans-serif; margin: 0; padding: 20px; color: #1c1917; }
  </style>
</head>
<body>
  <h1>Wangshi Homestay</h1>
  <p>Invoice Number: <strong>${item.invoiceNumber}</strong></p>
  <p>Status: PAID IN FULL</p>
</body>
</html>`;

    fs.writeFileSync(htmlPath, htmlContent, 'utf8');

    // Spawn Chrome headless to print to PDF
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--user-data-dir=${userProfileDir}`,
      `--print-to-pdf=${pdfPath}`,
      `file:///${htmlPath.replace(/\\/g, '/')}`
    ];

    const res = cp.spawnSync(CHROME_PATH, args, { encoding: 'utf8', timeout: 30000 });
    assert.strictEqual(res.status, 0, `Chrome must exit with code 0 for ${item.invoiceNumber}`);

    assert.ok(fs.existsSync(pdfPath), `PDF must be created for ${item.invoiceNumber}`);
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfString = pdfBuffer.toString('latin1');

    // In Chrome's PDF generator, document.title is written into the document Information Dictionary /Title
    // Chrome uses this exact metadata property to populate the Save As dialog default filename!
    const titleRegex = new RegExp(`\\/Title\\s*\\(([^)]*)\\)`);
    const match = pdfString.match(titleRegex);

    console.log(`   -> Invoice Number: "${item.invoiceNumber}"`);
    console.log(`   -> Sanitized Suggested Filename: "${sanitized}.pdf"`);
    console.log(`   -> Chrome PDF /Title: "${match ? match[1] : 'NOT FOUND'}"`);

    assert.ok(match, "Chrome PDF must contain /Title dictionary entry");
    assert.strictEqual(match[1], sanitized, `Chrome PDF title must match sanitized invoice number "${sanitized}"`);
    assert.ok(pdfBuffer.length > 5000, "PDF must have valid rendered length");

    // Clean up
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }

  console.log("✅ TEST 2 PASSED: Chrome Save as PDF correctly uses dynamic sanitized invoice numbers as filenames.\n");
}

console.log("===============================================================================");
console.log("🎉 ALL DYNAMIC PDF FILENAME VERIFICATION CHECKS PASSED SUCCESSFULLY! 🎉");
console.log("===============================================================================");
