import fs from "fs";

const data = JSON.parse(fs.readFileSync("scripts/wangshi_audit_data.json", "utf8"));

let md = "| # | Booking ID | Primary Guest | Phone | Stay Dates | Nights | Room | Status | Total (₹) | Invoices | Payments |\n";
md += "|---|---|---|---|---|---|---|---|---|---|---|\n";

data.bookingsDetailed.forEach((b, i) => {
  const g = b.guests[0];
  const gName = g ? g.name : "*(none)*";
  const gPhone = g && g.phone ? g.phone : "-";
  const invCount = b.invoices.length;
  const payCount = b.payments.length;
  md += `| ${i + 1} | \`${b.id}\` | ${gName} | ${gPhone} | ${b.check_in} to ${b.check_out} | ${b.nights} | Room ${b.room_number} | \`${b.status}\` | ₹${b.total_amount.toLocaleString()} | ${invCount} | ${payCount} |\n`;
});

fs.writeFileSync("scripts/wangshi_bookings_table.md", md, "utf8");
console.log("Table written to scripts/wangshi_bookings_table.md");

