/** Groups movements by batch_id. Unbatched movements become their own group. */
export interface MovementGroup {
  batchId: string;
  movements: any[];
  date: string;
  note: string;
  warehouse: string;
}

export function groupByBatch(movements: any[]): MovementGroup[] {
  const groups: Map<string, any[]> = new Map();
  
  for (const m of movements) {
    const key = m.batch_id || `_single_${m.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  
  return Array.from(groups.entries()).map(([batchId, items]) => ({
    batchId,
    movements: items,
    date: items[0].movement_date,
    note: items[0].reference_note || "",
    warehouse: (items[0].warehouses as any)?.warehouse_name || "",
  }));
}
