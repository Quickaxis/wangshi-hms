import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function createTestHtml(viewportWidth) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${viewportWidth}, initial-scale=1.0">
  <title>Folio PDF Test</title>
  <style>
    /* Simulate Tailwind v4 / Modern browser computed lab & oklch styles */
    :root {
      --stone-900: oklch(0.21 0.006 56.043);
      --stone-700: lab(37.5 0.5 1.5);
      --stone-600: lab(47.5 0.5 1.5);
      --stone-500: lab(57.5 0.5 1.5);
      --stone-400: lab(70.5 0.5 1.5);
      --stone-200: lab(89.5 0.5 1.5);
      --stone-100: lab(95.5 0.5 1.5);
      --emerald-50: oklch(0.979 0.021 166.113);
      --emerald-700: oklch(0.508 0.118 165.612);
      --blue-50: oklch(0.97 0.014 254.604);
      --blue-700: oklch(0.488 0.243 264.376);
      --amber-50: oklch(0.98 0.016 73.684);
      --amber-700: oklch(0.555 0.163 48.998);
      --brand-indigo: #5146D8;
    }

    body {
      margin: 0;
      padding: 10px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: lab(97 1 290);
      color: var(--stone-900);
      width: ${viewportWidth}px;
    }

    .invoice-container {
      background: #ffffff;
      padding: 24px;
      border: 1px solid var(--stone-200);
      border-radius: 12px;
      box-shadow: 0 4px 20px -2px lab(20 5 280 / 0.08);
      width: 794px;
      box-sizing: border-box;
    }

    .brand-line {
      height: 6px;
      width: 100%;
      background: linear-gradient(to right, var(--stone-900), var(--brand-indigo), var(--stone-900));
      border-radius: 9999px;
      margin-bottom: 20px;
    }

    .header-row {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid var(--stone-200);
      padding-bottom: 16px;
      margin-bottom: 16px;
    }

    .badge-paid {
      background-color: var(--emerald-50);
      color: var(--emerald-700);
      border: 1px solid var(--stone-200);
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: bold;
    }

    .badge-advance {
      background-color: var(--blue-50);
      color: var(--blue-700);
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      margin-bottom: 16px;
    }

    th {
      text-align: left;
      font-size: 11px;
      color: var(--stone-500);
      border-bottom: 1px solid var(--stone-200);
      padding: 8px 6px;
      text-transform: uppercase;
    }

    td {
      padding: 10px 6px;
      border-bottom: 1px solid var(--stone-100);
      font-size: 13px;
    }

    .summary-card {
      background-color: var(--stone-100);
      border: 1px solid var(--stone-200);
      border-radius: 8px;
      padding: 12px;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <!-- Offscreen / dedicated PDF capture element -->
  <div id="hms-pdf-capture-root" class="invoice-container">
    <div class="brand-line"></div>
    
    <div class="header-row">
      <div>
        <h2 style="margin: 0; font-size: 20px; color: var(--stone-900);">Wangshi Homestay</h2>
        <div style="font-size: 12px; color: var(--stone-600); margin-top: 4px;">Khanikar, Dibrugarh, Assam</div>
        <div style="font-size: 11px; color: var(--stone-500); margin-top: 2px;">+91 98765 43210 • info@wangshihms.in</div>
      </div>
      <div style="text-align: right;">
        <span class="badge-paid">PAID IN FULL</span>
        <div style="font-size: 14px; font-weight: bold; margin-top: 6px;">INV-WNG-20261201-0001</div>
        <div style="font-size: 11px; color: var(--stone-500);">Stay: 1 Dec 2026 — 2 Dec 2026</div>
      </div>
    </div>

    <!-- Guest Information -->
    <div style="font-size: 13px; margin-bottom: 16px;">
      <strong>Guest:</strong> Asian holidays (Phone: +91 8474878414)<br>
      <strong>Reserved Room:</strong> Room No. 2 (1 Night, 1 Guest)
    </div>

    <!-- Section 1: Room Charges -->
    <h3 style="font-size: 14px; margin: 16px 0 6px; color: var(--brand-indigo);">1. Contracted Accommodation</h3>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Period</th>
          <th>Rate / Nt</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Room No. 2</strong> (Deluxe Room)</td>
          <td>1 Dec – 2 Dec 2026</td>
          <td>₹2,500.00</td>
          <td style="text-align: right; font-weight: bold;">₹2,500.00</td>
        </tr>
      </tbody>
    </table>

    <!-- Section 2: Additional Folio Services -->
    <h3 style="font-size: 14px; margin: 16px 0 6px; color: var(--brand-indigo);">2. Additional Guest Services</h3>
    <table>
      <thead>
        <tr>
          <th>Service Item</th>
          <th>Category</th>
          <th>Qty</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Chef Special Assamese Thali Dinner</td>
          <td>Food & Dining</td>
          <td>2</td>
          <td style="text-align: right;">₹700.00</td>
        </tr>
        <tr>
          <td>Express Laundry Service</td>
          <td>Laundry</td>
          <td>1</td>
          <td style="text-align: right;">₹200.00</td>
        </tr>
        <tr>
          <td>Seasonal Welcome Concession</td>
          <td>Concession</td>
          <td>1</td>
          <td style="text-align: right; color: var(--emerald-700);">-₹150.00</td>
        </tr>
      </tbody>
    </table>

    <!-- Section 3: Billing & Taxes Summary -->
    <div class="summary-card">
      <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
        <span>Room Subtotal:</span>
        <span>₹2,500.00</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
        <span>Additional Services Subtotal:</span>
        <span>₹750.00</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
        <span>GST (6% CGST + 6% SGST):</span>
        <span>₹390.00</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; border-top: 1px solid var(--stone-200); padding-top: 6px; margin-top: 6px;">
        <span>Grand Total:</span>
        <span>₹3,640.00</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 13px; color: var(--emerald-700); margin-top: 4px; font-weight: 600;">
        <span>Total Paid:</span>
        <span>₹3,640.00</span>
      </div>
    </div>

    <!-- Section 4: Payment History -->
    <h3 style="font-size: 14px; margin: 20px 0 6px; color: var(--brand-indigo);">3. Payment & Settlement Ledger</h3>
    <table>
      <thead>
        <tr>
          <th>Stage</th>
          <th>Method</th>
          <th>Reference</th>
          <th>Date</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="badge-advance">Advance</span></td>
          <td>UPI (GPay)</td>
          <td>UPI-84920491823</td>
          <td>1 Dec 2026, 11:30 AM</td>
          <td style="text-align: right; font-weight: bold;">₹1,500.00</td>
        </tr>
        <tr>
          <td><span class="badge-paid">Settlement</span></td>
          <td>Cash</td>
          <td>REC-CSH-0023</td>
          <td>2 Dec 2026, 10:15 AM</td>
          <td style="text-align: right; font-weight: bold;">₹2,140.00</td>
        </tr>
      </tbody>
    </table>

    <!-- House Rules -->
    <div style="font-size: 11px; color: var(--stone-500); border-top: 1px dashed var(--stone-200); padding-top: 12px; margin-top: 16px;">
      <strong>Guest Stay Policy:</strong> Check-in: 12:00 PM • Check-out: 11:00 AM • Government photo ID required • Quiet hours after 10:00 PM.
    </div>
  </div>

  <div id="test-result" style="margin-top: 20px; font-weight: bold;">WAITING</div>

  <!-- Include bundle scripts for html2canvas and jsPDF -->
  <script src="./node_modules/html2canvas/dist/html2canvas.min.js"></script>
  <script src="./node_modules/jspdf/dist/jspdf.umd.min.js"></script>

  <script>
    // -------------------------------------------------------------
    // EXACT IMPLEMENTATION FROM src/lib/pdfGenerator.ts
    // -------------------------------------------------------------
    const colorConversionCache = new Map();
    let convCanvas = null;
    let convCtx = null;

    function parseColorToRgba(rawColor) {
      if (!rawColor || typeof rawColor !== 'string') return rawColor;
      const trimmed = rawColor.trim();
      if (!trimmed) return trimmed;
      if (colorConversionCache.has(trimmed)) return colorConversionCache.get(trimmed);

      if (!convCtx) {
        convCanvas = document.createElement('canvas');
        convCanvas.width = 1;
        convCanvas.height = 1;
        convCtx = convCanvas.getContext('2d', { willReadFrequently: true });
      }
      if (!convCtx) return trimmed;

      try {
        convCtx.clearRect(0, 0, 1, 1);
        convCtx.fillStyle = trimmed;
        convCtx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = convCtx.getImageData(0, 0, 1, 1).data;
        const alpha = (a / 255).toFixed(3).replace(/\\.?0+$/, '');
        const res = a === 255 ? \`rgb(\${r}, \${g}, \${b})\` : \`rgba(\${r}, \${g}, \${b}, \${alpha || 0})\`;
        colorConversionCache.set(trimmed, res);
        return res;
      } catch {
        return trimmed;
      }
    }

    const UNSUPPORTED_COLOR_REGEX = /(?:lab|lch|oklab|oklch)\\([^)]+\\)/gi;

    function sanitizeCssString(cssValue) {
      if (!cssValue || typeof cssValue !== 'string') return cssValue;
      if (!UNSUPPORTED_COLOR_REGEX.test(cssValue)) return cssValue;
      UNSUPPORTED_COLOR_REGEX.lastIndex = 0;
      return cssValue.replace(UNSUPPORTED_COLOR_REGEX, (match) => {
        return parseColorToRgba(match);
      });
    }

    function createStyleProxy(origDecl) {
      return new Proxy(origDecl, {
        get(target, prop) {
          const val = target[prop];
          if (typeof val === 'function') {
            return function (...args) {
              const res = val.apply(target, args);
              if (typeof res === 'string' && /(?:lab|lch|oklab|oklch)\\(/i.test(res)) {
                return sanitizeCssString(res);
              }
              return res;
            };
          }
          if (typeof val === 'string' && /(?:lab|lch|oklab|oklch)\\(/i.test(val)) {
            return sanitizeCssString(val);
          }
          return val;
        }
      });
    }

    const COLOR_PROPS = [
      "color",
      "background-color",
      "border-color",
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color",
      "outline-color",
      "box-shadow",
      "text-shadow",
      "background-image",
      "fill",
      "stroke",
    ];

    async function runTest() {
      const target = document.getElementById('hms-pdf-capture-root');
      const resultEl = document.getElementById('test-result');

      const origWinGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = function (elt, pseudoElt) {
        const decl = origWinGetComputedStyle.call(window, elt, pseudoElt);
        return createStyleProxy(decl);
      };

      try {
        const canvas = await html2canvas(target, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 1024,
          onclone: (clonedDoc, clonedElement) => {
            const cloneWin = clonedDoc.defaultView;
            if (cloneWin && cloneWin !== window) {
              const origCloneGetComputedStyle = cloneWin.getComputedStyle;
              cloneWin.getComputedStyle = function (elt, pseudoElt) {
                const decl = origCloneGetComputedStyle.call(cloneWin, elt, pseudoElt);
                return createStyleProxy(decl);
              };
            }

            const styleEls = clonedDoc.querySelectorAll('style');
            styleEls.forEach((styleEl) => {
              if (styleEl.textContent && /(?:lab|lch|oklab|oklch)\\(/i.test(styleEl.textContent)) {
                styleEl.textContent = sanitizeCssString(styleEl.textContent);
              }
            });

            if (clonedElement) {
              clonedElement.style.position = 'static';
              clonedElement.style.left = '0';
              clonedElement.style.top = '0';
              clonedElement.style.margin = '0 auto';
              clonedElement.style.width = '794px';
              if (clonedElement.parentElement) {
                clonedElement.parentElement.style.position = 'static';
                clonedElement.parentElement.style.left = '0';
                clonedElement.parentElement.style.top = '0';
              }

              const allElements = [clonedElement, ...Array.from(clonedElement.querySelectorAll('*'))];
              for (const el of allElements) {
                if (el instanceof HTMLElement || el instanceof SVGElement) {
                  if (el.style) {
                    for (let i = 0; i < el.style.length; i++) {
                      const prop = el.style[i];
                      const val = el.style.getPropertyValue(prop);
                      if (val && /(?:lab|lch|oklab|oklch)\\(/i.test(val)) {
                        el.style.setProperty(prop, sanitizeCssString(val), el.style.getPropertyPriority(prop));
                      }
                    }
                  }

                  try {
                    const comp = origWinGetComputedStyle.call(window, el);
                    for (const prop of COLOR_PROPS) {
                      const computedVal = comp.getPropertyValue(prop);
                      if (computedVal && /(?:lab|lch|oklab|oklch)\\(/i.test(computedVal)) {
                        el.style.setProperty(prop, sanitizeCssString(computedVal), "important");
                      }
                    }
                  } catch {}
                }
              }
            }
          }
        });

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });

        const pdfWidthMm = 210;
        const pdfHeightMm = 297;
        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        const imgHeightMm = (canvas.height * pdfWidthMm) / canvas.width;

        let heightLeft = imgHeightMm;
        let position = 0;

        doc.addImage(imgData, 'JPEG', 0, position, pdfWidthMm, imgHeightMm);
        heightLeft -= pdfHeightMm;

        while (heightLeft > 0) {
          position -= pdfHeightMm;
          doc.addPage();
          doc.addImage(imgData, 'JPEG', 0, position, pdfWidthMm, imgHeightMm);
          heightLeft -= pdfHeightMm;
        }

        const blob = doc.output('blob');
        resultEl.innerText = 'SUCCESS_BLOB_SIZE_' + blob.size + '_CANVAS_' + canvas.width + 'x' + canvas.height;
      } catch (err) {
        resultEl.innerText = 'FAILED: ' + err.message;
      } finally {
        window.getComputedStyle = origWinGetComputedStyle;
      }
    }

    window.addEventListener('load', runTest);
  </script>
</body>
</html>`;
}

function runViewportTest(viewportWidth) {
  return new Promise((resolve, reject) => {
    const html = createTestHtml(viewportWidth);
    const tmpFile = path.resolve(`test_folio_${viewportWidth}.html`);
    fs.writeFileSync(tmpFile, html, 'utf8');

    execFile(chromePath, [
      '--headless=new',
      '--disable-gpu',
      `--window-size=${viewportWidth},900`,
      '--virtual-time-budget=5000',
      '--dump-dom',
      tmpFile
    ], (err, stdout, stderr) => {
      try { fs.unlinkSync(tmpFile); } catch {}
      if (err) {
        return reject(err);
      }
      const match = stdout.match(/<div id="test-result"[^>]*>([^<]+)<\/div>/);
      resolve(match ? match[1] : 'NOT_FOUND');
    });
  });
}

async function main() {
  console.log('Testing PDF Generation at mobile 393px (e.g. iPhone 14/15/16 Pro)...');
  const res393 = await runViewportTest(393);
  console.log('393px Result:', res393);

  console.log('\nTesting PDF Generation at tablet / breakpoint 768px (iPad / mobile breakpoint)...');
  const res768 = await runViewportTest(768);
  console.log('768px Result:', res768);

  const passed = res393.startsWith('SUCCESS_BLOB_SIZE_') && res768.startsWith('SUCCESS_BLOB_SIZE_');
  if (passed) {
    console.log('\n>>> ALL PDF GENERATION TESTS PASSED CLEANLY! <<<');
    process.exit(0);
  } else {
    console.error('\n>>> TESTS FAILED! <<<');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

