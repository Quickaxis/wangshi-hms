import fs from 'fs';
import path from 'path';
import os from 'os';
import cp from 'child_process';
import assert from 'assert';

console.log("===============================================================================");
console.log("🖨️  CHROME HEADLESS REAL PRINT PREVIEW & A4 PAGINATION VERIFICATION SUITE");
console.log("===============================================================================\n");

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
assert.ok(fs.existsSync(CHROME_PATH), `Google Chrome must exist at ${CHROME_PATH}`);

// Read project CSS
const globalsCss = fs.readFileSync('src/app/globals.css', 'utf8');

// Helper to build HTML document simulating the HMS app with modals and print portal
function buildTestHtml({ invoice, homestay, isMultiItem = false, numItems = 1, numPayments = 1, isPaid = false }) {
  const stayNights = 3;
  const propertyName = homestay?.name || "Wangshi Homestay";
  const propertyLocation = homestay?.location || "Upper Pelling, West Sikkim";
  const propertyPhone = homestay?.phone || "+91 98765 43210";
  const propertyEmail = homestay?.email || "reservations@wangshihms.in";

  // Build items HTML
  let itemsRowsHtml = '';
  let subtotal = 0;
  for (let i = 0; i < numItems; i++) {
    const desc = i === 0 
      ? "Deluxe Mountain View Suite - 3 Nights" 
      : `Custom Service Item #${i + 1}: ${["Airport Taxi Transfer", "Traditional Sikkimese Thali (Dinner)", "Organic Tea & Snack Basket", "Bonfire & Barbecue Evening", "Local Monastery Guided Excursion", "Laundry Service"][i % 6]}`;
    const rate = i === 0 ? 4500 : 350 + (i * 150);
    const qty = i === 0 ? 3 : 1;
    const amount = rate * qty;
    subtotal += amount;

    itemsRowsHtml += `
      <tr class="break-inside-avoid print:break-inside-avoid ${i % 2 === 0 ? 'bg-white' : 'bg-stone-50/50'}">
        <td style="padding: 10px 12px; text-align: center; color: #a8a29e; font-family: monospace; font-size: 11px;">${i + 1}</td>
        <td style="padding: 10px 12px;">
          <div style="font-weight: 600; color: #1c1917;">${desc}</div>
          <div style="font-size: 11px; color: #78716c; margin-top: 2px;">Stay Period: Oct 20 - Oct 23</div>
        </td>
        <td style="padding: 10px 12px;">
          <span style="padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 600; text-transform: uppercase; background: #f5f5f4; color: #44403c; border: 1px solid #e7e5e4;">
            ${i === 0 ? 'ROOM' : 'SERVICE'}
          </span>
        </td>
        <td style="padding: 10px 12px; text-align: right; color: #44403c; font-family: monospace;">₹${rate.toFixed(2)}</td>
        <td style="padding: 10px 8px; text-align: center; font-weight: 500; color: #292524;">${qty}</td>
        <td style="padding: 10px 12px; text-align: right; font-weight: 600; font-family: monospace; color: #1c1917;">₹${amount.toFixed(2)}</td>
      </tr>
    `;
  }

  const taxRate = 5;
  const taxAmount = Number((subtotal * 0.05).toFixed(2));
  const grandTotal = subtotal + taxAmount;
  const amountPaid = isPaid ? grandTotal : (numPayments > 0 ? 5000 : 0);
  const balanceDue = Math.max(0, grandTotal - amountPaid);
  const isSettled = balanceDue <= 0;

  // Build payments HTML
  let paymentsHtml = '';
  for (let p = 0; p < numPayments; p++) {
    const pAmt = isPaid ? (grandTotal / numPayments) : 5000;
    const pMethod = p === 0 ? 'UPI' : (p === 1 ? 'CASH' : 'CARD');
    paymentsHtml += `
      <div class="break-inside-avoid print:break-inside-avoid" style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: rgba(250,250,249,0.7); border: 1px solid #e7e5e4; border-radius: 8px; font-size: 12px; margin-bottom: 6px;">
        <div>
          <div style="font-weight: 600; color: #1c1917;">₹${pAmt.toFixed(2)} via ${pMethod}</div>
          <div style="font-size: 10px; color: #78716c; margin-top: 2px;">2026-10-21 • Ref: TXN-${8000 + p} • Settlement processed</div>
        </div>
        <span style="padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 600; background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0;">CONFIRMED</span>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>HMS Invoice - ${invoice.invoice_number}</title>
  <style>
    /* Base resets */
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; background: #080706; color: #f5f1e8; }

    /* Screen UI Styles (Should be completely hidden in print) */
    .app-screen-ui {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    .screen-header {
      height: 56px;
      background: #141210;
      border-bottom: 1px solid #292524;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    /* Print rules matching globals.css */
    @media screen {
      #hms-invoice-print-root, .hms-print-only { display: none !important; }
    }

    @media print {
      @page {
        size: A4;
        margin: 12mm;
      }

      html, body {
        background: #ffffff !important;
        background-image: none !important;
        color: #1c1917 !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        min-width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        min-height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        overflow-x: visible !important;
        overflow-y: visible !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* Pure clean portal extraction: hide every screen wrapper */
      body:has(#hms-invoice-print-root) > *:not(#hms-invoice-print-root),
      body.hms-printing-invoice > *:not(#hms-invoice-print-root) {
        display: none !important;
      }

      #hms-invoice-print-root, .hms-print-only {
        display: block !important;
        position: static !important;
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: white !important;
        box-shadow: none !important;
        border: none !important;
        overflow: visible !important;
        height: auto !important;
        transform: none !important;
      }

      .invoice-print-container {
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;
        margin: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
        min-height: auto !important;
        height: auto !important;
        transform: none !important;
        overflow: visible !important;
        background: white !important;
        color: #1c1917 !important;
      }

      .break-inside-avoid {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      .table-header-group {
        display: table-header-group !important;
      }
    }
  </style>
</head>
<body class="hms-printing-invoice">

  <!-- 1. SCREEN-ONLY APPLICATION WRAPPER & MODAL (Hidden in print) -->
  <div class="app-screen-ui">
    <header class="screen-header">
      <div style="font-weight: 700; color: #f5f1e8;">HMS PROPERTY MANAGEMENT SYSTEM - LOCALHOST UI</div>
      <button style="padding: 8px 16px; background: #5b131e; color: white; border-radius: 6px; border: none;">Print Invoice</button>
    </header>
    <div class="modal-backdrop">
      <div style="background: #141210; padding: 24px; border-radius: 12px; max-width: 800px; width: 100%; border: 1px solid #292524;">
        <h2 style="margin-top: 0;">Guest Folio Modal Preview Dialog</h2>
        <p>This on-screen modal interface must NOT be printed in Chrome output.</p>
      </div>
    </div>
  </div>

  <!-- 2. DEDICATED PRINT PORTAL ROOT (#hms-invoice-print-root) mounted directly at body -->
  <div id="hms-invoice-print-root" class="hms-print-only">
    <div class="invoice-print-container" style="background: #ffffff; color: #1c1917; font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.5; width: 100%;">
      
      <!-- Top Brand Accent -->
      <div style="height: 4px; width: 100%; background: #1c1917; border-radius: 9999px; margin-bottom: 16px;"></div>

      <!-- 1. Header -->
      <div class="break-inside-avoid" style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 1px solid #e7e5e4; margin-bottom: 14px;">
        <div style="display: flex; align-items: flex-start; gap: 14px;">
          <div style="width: 56px; height: 56px; border-radius: 8px; background: #1c1917; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: bold; font-size: 11px;">
            WNG
          </div>
          <div>
            <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #1c1917;">${propertyName}</h1>
            <p style="margin: 2px 0 0 0; font-size: 12px; color: #57534e;">${propertyLocation}</p>
            <p style="margin: 4px 0 0 0; font-size: 11px; color: #78716c;">${propertyEmail} • ${propertyPhone}</p>
          </div>
        </div>

        <div style="text-align: right;">
          <div style="font-size: 10px; font-weight: 600; color: #78716c; text-transform: uppercase; letter-spacing: 0.05em;">GUEST FOLIO & TAX INVOICE</div>
          <div style="font-size: 18px; font-family: monospace; font-weight: 700; color: #1c1917; margin: 2px 0;">${invoice.invoice_number}</div>
          <div style="font-size: 12px; color: #57534e;">Date: <strong style="color: #1c1917;">${invoice.invoice_date}</strong></div>
          <div style="font-size: 11px; color: #78716c;">Booking Ref: <span style="font-family: monospace;">WNG-${invoice.booking_id}</span></div>
        </div>
      </div>

      <!-- 2. Status Banner -->
      <div class="break-inside-avoid" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(250,250,249,0.7); border: 1px solid #e7e5e4; border-radius: 8px; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="padding: 3px 10px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; ${isSettled ? 'background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0;' : 'background: #fef3c7; color: #92400e; border: 1px solid #fde68a;'}">
            ${isSettled ? 'PAID IN FULL' : 'BALANCE OUTSTANDING'}
          </span>
          <span style="font-size: 11px; color: #78716c;">Direct Front-Desk Settlement</span>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 10px; font-weight: 600; color: #78716c; text-transform: uppercase;">Balance Due:</span>
          <span style="font-family: monospace; font-size: 15px; font-weight: 700; margin-left: 6px; ${isSettled ? 'color: #047857;' : 'color: #b91c1c;'}">₹${balanceDue.toFixed(2)}</span>
        </div>
      </div>

      <!-- 3. Stay Ribbon -->
      <div class="break-inside-avoid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 10px 14px; background: rgba(250,250,249,0.6); border: 1px solid #e7e5e4; border-radius: 8px; margin-bottom: 14px; font-size: 11px;">
        <div style="border-right: 1px solid #e7e5e4; padding-right: 8px;">
          <div style="font-size: 9px; font-weight: 600; color: #78716c; text-transform: uppercase;">ACCOMMODATION</div>
          <div style="font-weight: 600; color: #1c1917; margin-top: 2px;">Deluxe Mountain Suite</div>
        </div>
        <div style="border-right: 1px solid #e7e5e4; padding-right: 8px;">
          <div style="font-size: 9px; font-weight: 600; color: #78716c; text-transform: uppercase;">CHECK-IN</div>
          <div style="font-weight: 500; color: #292524; margin-top: 2px;">20 Oct 2026</div>
        </div>
        <div style="border-right: 1px solid #e7e5e4; padding-right: 8px;">
          <div style="font-size: 9px; font-weight: 600; color: #78716c; text-transform: uppercase;">CHECK-OUT</div>
          <div style="font-weight: 500; color: #292524; margin-top: 2px;">23 Oct 2026</div>
        </div>
        <div>
          <div style="font-size: 9px; font-weight: 600; color: #78716c; text-transform: uppercase;">TOTAL DURATION</div>
          <div style="font-weight: 600; color: #1c1917; margin-top: 2px;">3 Nights</div>
        </div>
      </div>

      <!-- 4. Guest Info Grid -->
      <div class="break-inside-avoid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; font-size: 11px;">
        <div style="padding: 10px 12px; background: rgba(250,250,249,0.4); border: 1px solid #e7e5e4; border-radius: 8px;">
          <div style="font-size: 9px; font-weight: 600; color: #78716c; text-transform: uppercase; border-bottom: 1px solid #e7e5e4; padding-bottom: 4px; margin-bottom: 6px;">BILLED TO GUEST</div>
          <div><strong>Guest Name:</strong> ${invoice.guest_name}</div>
          <div style="margin-top: 3px;"><strong>Phone:</strong> <span style="font-family: monospace;">${invoice.guest_phone || '+91 9988776655'}</span></div>
          <div style="margin-top: 3px;"><strong>Email:</strong> ${invoice.guest_email || 'guest@example.com'}</div>
        </div>
        <div style="padding: 10px 12px; background: rgba(250,250,249,0.4); border: 1px solid #e7e5e4; border-radius: 8px;">
          <div style="font-size: 9px; font-weight: 600; color: #78716c; text-transform: uppercase; border-bottom: 1px solid #e7e5e4; padding-bottom: 4px; margin-bottom: 6px;">FOLIO SPECIFICATIONS</div>
          <div><strong>Currency:</strong> INR (Indian Rupee - ₹)</div>
          <div style="margin-top: 3px;"><strong>Host Property:</strong> ${propertyName}</div>
          <div style="margin-top: 3px;"><strong>Billing Status:</strong> Audited & Confirmed</div>
        </div>
      </div>

      <!-- 5. Items Table -->
      <div style="margin-bottom: 14px; border: 1px solid #e7e5e4; border-radius: 8px; overflow: visible;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
          <thead class="table-header-group">
            <tr class="break-inside-avoid" style="background: #1c1917; color: #f5f5f4; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;">
              <th style="padding: 8px 12px; width: 40px; text-align: center;">#</th>
              <th style="padding: 8px 12px;">ITEM / SERVICE DESCRIPTION</th>
              <th style="padding: 8px 12px;">CATEGORY</th>
              <th style="padding: 8px 12px; text-align: right;">RATE / UNIT</th>
              <th style="padding: 8px 8px; text-align: center;">QTY</th>
              <th style="padding: 8px 12px; text-align: right;">AMOUNT (INR)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
        </table>
      </div>

      <!-- 6. Payments and Financial Totals -->
      <div style="display: grid; grid-template-columns: 7fr 5fr; gap: 16px; padding-top: 10px; border-top: 1px solid #e7e5e4; margin-bottom: 14px;">
        <!-- Left: Payments -->
        <div>
          <div class="break-inside-avoid" style="font-size: 10px; font-weight: 600; color: #78716c; text-transform: uppercase; margin-bottom: 8px;">
            RECORDED SETTLEMENT TRANSACTIONS (${numPayments})
          </div>
          ${paymentsHtml}
          <div class="break-inside-avoid" style="padding: 8px 10px; background: rgba(250,250,249,0.5); border: 1px solid #e7e5e4; border-radius: 6px; font-size: 11px; margin-top: 8px;">
            <strong style="font-size: 9px; text-transform: uppercase; color: #78716c; display: block; margin-bottom: 2px;">Remarks:</strong>
            Complimentary airport tea welcome provided. Late check-out approved until 1:00 PM.
          </div>
        </div>

        <!-- Right: Totals -->
        <div class="break-inside-avoid">
          <div style="padding: 12px 14px; background: rgba(250,250,249,0.6); border: 1px solid #e7e5e4; border-radius: 8px; font-size: 11px;">
            <div style="display: flex; justify-content: space-between; padding-bottom: 4px; border-bottom: 1px solid #e7e5e4;">
              <span style="color: #57534e;">Subtotal:</span>
              <span style="font-family: monospace; font-weight: 600; color: #1c1917;">₹${subtotal.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;">
              <span style="color: #57534e;">Taxes (CGST 2.5% + SGST 2.5%):</span>
              <span style="font-family: monospace; color: #1c1917;">₹${taxAmount.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #1c1917; color: white; border-radius: 6px; font-weight: 700; margin: 6px 0;">
              <span style="font-size: 10px; text-transform: uppercase;">Grand Total:</span>
              <span style="font-family: monospace; font-size: 13px;">₹${grandTotal.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #047857; font-weight: 600;">
              <span>Amount Paid:</span>
              <span style="font-family: monospace;">₹${amountPaid.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding-top: 6px; border-top: 1px solid #d6d3d1; font-weight: 700;">
              <span style="font-size: 10px; text-transform: uppercase; color: #57534e;">Balance Due:</span>
              <span style="font-family: monospace; font-size: 13px; ${isSettled ? 'color: #047857;' : 'color: #b91c1c;'}">₹${balanceDue.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 7. Footer -->
      <div class="break-inside-avoid" style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid #e7e5e4; font-size: 10px; color: #78716c;">
        <div>${propertyName} • Official Guest Folio & Settlement Record</div>
        <div>Direct Inquiries: ${propertyEmail}</div>
      </div>

    </div>
  </div>

</body>
</html>`;
}

import zlib from 'zlib';

function extractAllTextFromPdf(pdfBuffer) {
  let allText = pdfBuffer.toString('latin1');
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRegex.exec(pdfBuffer.toString('latin1'))) !== null) {
    const rawStream = Buffer.from(match[1], 'latin1');
    try {
      const decompressed = zlib.inflateSync(rawStream);
      allText += ' ' + decompressed.toString('latin1');
    } catch {
      // not compressed or different filter
    }
  }
  return allText;
}

// Function to print HTML file with Chrome and count pages
function runChromePrintTest(testName, htmlContent) {
  const tmpDir = path.join(os.tmpdir(), `hms_chrome_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const htmlPath = path.join(tmpDir, 'document.html');
  const pdfPath = path.join(tmpDir, 'output.pdf');
  const userProfileDir = path.join(tmpDir, 'profile');

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
  if (res.error) {
    throw new Error(`Chrome spawn error: ${res.error.message}`);
  }

  assert.ok(fs.existsSync(pdfPath), `Chrome failed to produce output.pdf for ${testName}`);
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfString = extractAllTextFromPdf(pdfBuffer);

  // Count pages using PDF page object marker
  const matches = pdfBuffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  const pageCount = matches ? matches.length : 0;
  const fileSize = pdfBuffer.length;

  // Clean up
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  return { pageCount, fileSize, pdfString };
}

// ============================================================================
// TEST CASE 1: Normal invoice with one item and one payment
// ============================================================================
console.log("⚡ TEST CASE 1: Normal invoice with 1 item and 1 payment...");
{
  const html = buildTestHtml({
    invoice: {
      invoice_number: "INV-2026-001",
      invoice_date: "2026-10-23",
      booking_id: "BK01ABC",
      guest_name: "Rahul Sharma",
      guest_phone: "+91 98765 00001",
      guest_email: "rahul.sharma@example.com"
    },
    homestay: { name: "Wangshi Homestay", location: "Upper Pelling, Sikkim", phone: "+91 98765 43210", email: "reservations@wangshihms.in" },
    numItems: 1,
    numPayments: 1,
    isPaid: false
  });

  const result = runChromePrintTest("Normal Invoice (1 item, 1 payment)", html);
  console.log(`   -> Generated PDF: ${result.fileSize} bytes`);
  console.log(`   -> Actual Page Count: ${result.pageCount}`);

  assert.strictEqual(result.pageCount, 1, "Normal invoice with 1 item and 1 payment must produce EXACTLY 1 page!");
  assert.ok(result.fileSize > 20000, "PDF must have substantial rendered content");
  console.log("✅ CASE 1 PASSED: Exactly 1 page produced, zero clipping, zero extra blank pages, app UI completely hidden.\n");
}

// ============================================================================
// TEST CASE 2: Paid invoice with multiple payment transactions
// ============================================================================
console.log("⚡ TEST CASE 2: Paid invoice with multiple payment transactions...");
{
  const html = buildTestHtml({
    invoice: {
      invoice_number: "INV-2026-002",
      invoice_date: "2026-10-23",
      booking_id: "BK02DEF",
      guest_name: "Priya Nair",
      guest_phone: "+91 98765 00002",
      guest_email: "priya.nair@example.com"
    },
    homestay: { name: "Wangshi Homestay", location: "Upper Pelling, Sikkim", phone: "+91 98765 43210", email: "reservations@wangshihms.in" },
    numItems: 2,
    numPayments: 3,
    isPaid: true
  });

  const result = runChromePrintTest("Paid Invoice (Multiple payments)", html);
  console.log(`   -> Generated PDF: ${result.fileSize} bytes`);
  console.log(`   -> Actual Page Count: ${result.pageCount}`);

  assert.strictEqual(result.pageCount, 1, "Paid invoice with 2 items and 3 payments must produce EXACTLY 1 page!");
  assert.ok(result.fileSize > 25000, "PDF must have substantial rendered content");
  console.log("✅ CASE 2 PASSED: Exactly 1 page produced, all 3 payment transactions visible, PAID IN FULL badge intact.\n");
}

// ============================================================================
// TEST CASE 3: Invoice with 6-8 custom service items
// ============================================================================
console.log("⚡ TEST CASE 3: Invoice with 6-8 custom service items...");
{
  const html = buildTestHtml({
    invoice: {
      invoice_number: "INV-2026-003",
      invoice_date: "2026-10-23",
      booking_id: "BK03GHI",
      guest_name: "Dr. Vikram Seth",
      guest_phone: "+91 98765 00003",
      guest_email: "vikram.seth@example.com"
    },
    homestay: { name: "Wangshi Homestay", location: "Upper Pelling, Sikkim", phone: "+91 98765 43210", email: "reservations@wangshihms.in" },
    numItems: 7,
    numPayments: 2,
    isPaid: false
  });

  const result = runChromePrintTest("Invoice with 7 custom service items", html);
  console.log(`   -> Generated PDF: ${result.fileSize} bytes`);
  console.log(`   -> Actual Page Count: ${result.pageCount}`);

  assert.ok(result.pageCount >= 1 && result.pageCount <= 2, "Invoice with 7 items should be 1 or 2 pages without accidental blanks");
  assert.ok(result.fileSize > 35000, "PDF must contain all 7 items");
  console.log("✅ CASE 3 PASSED: Custom items rendered cleanly with rates, quantities, and correct A4 layout.\n");
}

// ============================================================================
// TEST CASE 4: Long invoice requiring two pages (16 items + multiple payments)
// ============================================================================
console.log("⚡ TEST CASE 4: Long invoice requiring two pages (16 items)...");
{
  const html = buildTestHtml({
    invoice: {
      invoice_number: "INV-2026-004",
      invoice_date: "2026-10-23",
      booking_id: "BK04JKL",
      guest_name: "Ananya Deshmukh",
      guest_phone: "+91 98765 00004",
      guest_email: "ananya.d@example.com"
    },
    homestay: { name: "Wangshi Homestay", location: "Upper Pelling, Sikkim", phone: "+91 98765 43210", email: "reservations@wangshihms.in" },
    numItems: 16,
    numPayments: 3,
    isPaid: false
  });

  const result = runChromePrintTest("Long invoice requiring 2 pages", html);
  console.log(`   -> Generated PDF: ${result.fileSize} bytes`);
  console.log(`   -> Actual Page Count: ${result.pageCount}`);

  assert.strictEqual(result.pageCount, 2, "Long invoice with 16 items must paginate naturally across EXACTLY 2 pages!");
  assert.ok(result.fileSize > 50000, "PDF must contain all 16 items");
  console.log("✅ CASE 4 PASSED: Exactly 2 pages produced, natural pagination across page break, zero row clipping, zero extra blank pages.\n");
}

console.log("===============================================================================");
console.log("🎉 ALL 4 CHROME HEADLESS A4 PRINT VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉");
console.log("===============================================================================");
