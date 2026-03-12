import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function generateMovementReceipt(movement: any, title: string) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("StockTracker", 14, 20);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(title.toUpperCase(), 14, 28);

  // Line
  doc.setDrawColor(200);
  doc.line(14, 32, pageWidth - 14, 32);

  // Details
  doc.setTextColor(0);
  doc.setFontSize(10);

  const details = [
    ["Document:", title],
    ["Date:", new Date(movement.movement_date).toLocaleDateString()],
    ["Item Code:", movement.products?.item_code || "N/A"],
    ["Description:", movement.products?.item_description || "N/A"],
    ["Warehouse:", movement.warehouses?.warehouse_name || "N/A"],
    ["Movement Type:", movement.movement_type],
    ["Quantity:", String(movement.quantity)],
    ["Reference:", movement.reference_note || "—"],
    ["Record ID:", movement.id],
  ];

  let y = 40;
  details.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 60, y);
    y += 7;
  });

  // Footer
  y += 10;
  doc.setDrawColor(200);
  doc.line(14, y, pageWidth - 14, y);
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text(`Generated on ${new Date().toLocaleString()}`, 14, y);
  doc.text("StockTracker Inventory System", pageWidth - 14, y, { align: "right" });

  // Signature lines
  y += 20;
  doc.setDrawColor(180);
  doc.line(14, y, 80, y);
  doc.line(pageWidth - 80, y, pageWidth - 14, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("Prepared By", 14, y);
  doc.text("Received By", pageWidth - 80, y);

  doc.save(`${title.replace(/\s+/g, "_")}_${movement.products?.item_code || "item"}_${new Date(movement.movement_date).toISOString().split("T")[0]}.pdf`);
}

export function generateMovementReport(movements: any[], title: string) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("StockTracker", 14, 20);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(title.toUpperCase(), 14, 28);

  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}  |  Records: ${movements.length}`, 14, 35);

  doc.setDrawColor(200);
  doc.line(14, 38, pageWidth - 14, 38);

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
    startY: 42,
    head: [["Date", "Type", "Item Code", "Description", "Warehouse", "Qty", "Note"]],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 22 },
      5: { halign: "right", cellWidth: 15 },
    },
  });

  // Summary
  const totalQty = movements.reduce((sum, m) => sum + m.quantity, 0);
  const finalY = (doc as any).lastAutoTable?.finalY || 100;
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text(`Total Quantity: ${totalQty}`, 14, finalY + 10);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.setFont("helvetica", "normal");
  doc.text("StockTracker Inventory System", pageWidth - 14, finalY + 10, { align: "right" });

  doc.save(`${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
}
