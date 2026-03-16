import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Color themes per movement type
const themes = {
  receiving: {
    primary: [16, 124, 65] as [number, number, number],      // Green
    secondary: [220, 252, 231] as [number, number, number],
    accent: [34, 197, 94] as [number, number, number],
    label: "GOODS RECEIVED NOTE",
    reportLabel: "RECEIVING REPORT",
    stripe: [240, 253, 244] as [number, number, number],
  },
  issuing: {
    primary: [153, 27, 27] as [number, number, number],      // Red
    secondary: [254, 226, 226] as [number, number, number],
    accent: [239, 68, 68] as [number, number, number],
    label: "GOODS ISSUE SLIP",
    reportLabel: "ISSUING REPORT",
    stripe: [254, 242, 242] as [number, number, number],
  },
  transfer: {
    primary: [30, 64, 175] as [number, number, number],      // Blue
    secondary: [219, 234, 254] as [number, number, number],
    accent: [59, 130, 246] as [number, number, number],
    label: "STOCK TRANSFER NOTE",
    reportLabel: "TRANSFER REPORT",
    stripe: [239, 246, 255] as [number, number, number],
  },
};

type ThemeKey = keyof typeof themes;

function getTheme(title: string): (typeof themes)[ThemeKey] {
  if (title.toLowerCase().includes("receiv")) return themes.receiving;
  if (title.toLowerCase().includes("issue") || title.toLowerCase().includes("issuing")) return themes.issuing;
  return themes.transfer;
}

function drawHeader(doc: jsPDF, theme: (typeof themes)[ThemeKey]) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Colored banner
  doc.setFillColor(...theme.primary);
  doc.rect(0, 0, pageWidth, 38, "F");

  // Accent bar
  doc.setFillColor(...theme.accent);
  doc.rect(0, 38, pageWidth, 3, "F");

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("StockTracker", 16, 18);

  // Document type
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  doc.text(theme.label, 16, 30);

  // Date on right
  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString(), pageWidth - 16, 30, { align: "right" });
}

function drawFooter(doc: jsPDF, theme: (typeof themes)[ThemeKey]) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const y = pageHeight - 30;

  // Signature lines
  doc.setDrawColor(...theme.accent);
  doc.setLineWidth(0.5);
  doc.line(16, y, 85, y);
  doc.line(pageWidth - 85, y, pageWidth - 16, y);

  doc.setFontSize(8);
  doc.setTextColor(...theme.primary);
  doc.setFont("helvetica", "bold");
  doc.text("Prepared By", 16, y + 5);
  doc.text("Received By", pageWidth - 85, y + 5);

  // Bottom bar
  doc.setFillColor(...theme.primary);
  doc.rect(0, pageHeight - 14, pageWidth, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${new Date().toLocaleString()}`, 16, pageHeight - 5);
  doc.text("StockTracker Inventory System", pageWidth - 16, pageHeight - 5, { align: "right" });
}

export function generateMovementReceipt(movement: any, title: string) {
  const doc = new jsPDF();
  const theme = getTheme(title);
  const pageWidth = doc.internal.pageSize.getWidth();

  drawHeader(doc, theme);

  // Document number box
  const boxY = 50;
  doc.setFillColor(...theme.secondary);
  doc.roundedRect(16, boxY, pageWidth - 32, 22, 3, 3, "F");
  doc.setFontSize(9);
  doc.setTextColor(...theme.primary);
  doc.setFont("helvetica", "bold");
  doc.text("DOCUMENT ID", 24, boxY + 9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8);
  doc.text(movement.id, 24, boxY + 16);

  // Details table
  const details = [
    ["Date", new Date(movement.movement_date).toLocaleDateString()],
    ["Item Code", movement.products?.item_code || "N/A"],
    ["Description", movement.products?.item_description || "N/A"],
    ["Warehouse", movement.warehouses?.warehouse_name || "N/A"],
    ["Movement Type", movement.movement_type],
    ["Quantity", String(movement.quantity)],
    ["Reference", movement.reference_note || "—"],
  ];

  autoTable(doc, {
    startY: boxY + 30,
    body: details,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: { top: 5, bottom: 5, left: 12, right: 12 } },
    columnStyles: {
      0: { fontStyle: "bold", textColor: theme.primary, cellWidth: 45 },
      1: { textColor: [40, 40, 40] },
    },
    alternateRowStyles: { fillColor: theme.stripe },
    margin: { left: 16, right: 16 },
  });

  drawFooter(doc, theme);

  doc.save(`${title.replace(/\s+/g, "_")}_${movement.products?.item_code || "item"}_${new Date(movement.movement_date).toISOString().split("T")[0]}.pdf`);
}

export function generateMovementReport(movements: any[], title: string) {
  const doc = new jsPDF();
  const theme = getTheme(title);
  const pageWidth = doc.internal.pageSize.getWidth();

  drawHeader(doc, theme);

  // Summary box
  const boxY = 50;
  const totalQty = movements.reduce((sum, m) => sum + m.quantity, 0);
  doc.setFillColor(...theme.secondary);
  doc.roundedRect(16, boxY, pageWidth - 32, 18, 3, 3, "F");
  doc.setFontSize(9);
  doc.setTextColor(...theme.primary);
  doc.setFont("helvetica", "bold");
  doc.text(`${theme.reportLabel}`, 24, boxY + 8);
  doc.text(`Total Records: ${movements.length}    |    Total Quantity: ${totalQty}`, 24, boxY + 14);

  // Table
  const tableData = movements.map((m) => [
    new Date(m.movement_date).toLocaleDateString(),
    m.movement_type,
    m.products?.item_code || "N/A",
    m.products?.item_description || "N/A",
    m.warehouses?.warehouse_name || "N/A",
    String(m.quantity),
    m.reference_note || "—",
  ]);

  autoTable(doc, {
    startY: boxY + 26,
    head: [["Date", "Type", "Item Code", "Description", "Warehouse", "Qty", "Note"]],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: {
      fillColor: theme.primary,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: theme.stripe },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 22 },
      5: { halign: "right", cellWidth: 15 },
    },
    margin: { left: 16, right: 16 },
  });

  // Footer bar
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFillColor(...theme.primary);
  doc.rect(0, pageHeight - 14, pageWidth, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 16, pageHeight - 5);
  doc.text("StockTracker Inventory System", pageWidth - 16, pageHeight - 5, { align: "right" });

  doc.save(`${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
}
