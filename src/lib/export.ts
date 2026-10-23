// La bibliothèque Excel est chargée seulement au moment de l'export.
export async function exportRows(rows: Record<string, unknown>[], filename: string, format: 'xlsx' | 'csv') {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Locations');
  XLSX.writeFile(wb, `${filename}.${format}`, format === 'csv' ? { bookType: 'csv', FS: ';' } : undefined);
}
