// src/features/exports.js
// CSV import, CSV export, Excel export, PDF export, print.

import { appState } from '../core/state.js';
import { roundTo } from '../core/validators.js';
import { formatCurrency, formatNumber, formatGallons, formatRate, formatQuarterDisplay } from '../core/formatters.js';
import { getIftaTaxRates } from '../core/tax-utils.js';
import { downloadFile } from '../lib/dom.js';
import { showToast } from '../ui/toast.js';
import { getDisplayTaxDue, addNewRow, updateTotals } from '../ui/table.js';

// calculateRow is injected to avoid circular deps
let _calculateRow = () => {};
export function initExports({ calculateRow }) { _calculateRow = calculateRow; }

// ── CSV Import ─────────────────────────────────────────────────────────────

export function handleCsvImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const IFTA_TAX_RATES = getIftaTaxRates();
            const csv = e.target.result;
            const lines = csv.split('\n');
            const validJurisdictions = Object.keys(IFTA_TAX_RATES?.jurisdictions || {});
            let importedCount = 0, skippedCount = 0;
            const skippedJurisdictions = [];

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const [jurisdiction, totalMiles, taxableMiles, taxPaidGallons] =
                    line.split(',').map(s => s.trim());

                if (jurisdiction) {
                    const code = jurisdiction.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
                    if (validJurisdictions.length > 0 && !validJurisdictions.includes(code)) {
                        skippedCount++;
                        if (!skippedJurisdictions.includes(jurisdiction)) skippedJurisdictions.push(jurisdiction);
                        continue;
                    }

                    const rowData = addNewRow();
                    rowData.jurisdiction   = code;
                    rowData.totalMiles     = parseFloat(totalMiles)    || 0;
                    rowData.taxableMiles   = parseFloat(taxableMiles)  || 0;
                    rowData.taxPaidGallons = parseFloat(taxPaidGallons) || 0;

                    const row = document.getElementById(`row-${rowData.id}`);
                    if (row) {
                        row.querySelector('.jurisdiction-select').value = rowData.jurisdiction;
                        row.querySelector('.total-miles').value         = rowData.totalMiles;
                        row.querySelector('.taxable-miles').value       = rowData.taxableMiles;
                        row.querySelector('.tax-paid-gallons').value    = rowData.taxPaidGallons;
                    }
                    _calculateRow(rowData.id);
                    importedCount++;
                }
            }

            if (skippedCount > 0) {
                showToast(`Imported ${importedCount} rows. Skipped ${skippedCount} invalid: ${skippedJurisdictions.join(', ')}`, 'warning');
            } else {
                showToast(`Imported ${importedCount} rows from CSV`, 'success');
            }
        } catch (error) {
            console.error('CSV import error:', error);
            showToast('Error importing CSV file', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ── CSV Export ─────────────────────────────────────────────────────────────

export function exportToCsv() {
    if (!appState.baseJurisdiction) {
        showToast('Please select a Base Jurisdiction before exporting.', 'warning');
        document.getElementById('baseJurisdiction')?.focus();
        return;
    }
    const dataRows = appState.rows.filter(r => r.jurisdiction);
    if (dataRows.length === 0) {
        showToast('No data to export. Please add some trip data first.', 'warning');
        return;
    }
    try {
        const IFTA_TAX_RATES = getIftaTaxRates();
        let csv = '\uFEFF';
        csv += 'Jurisdiction,Total Miles,Taxable Miles,Tax Paid Gallons,Tax Rate,Taxable Gallons,Net Taxable Gallons,Tax Due\n';
        dataRows.forEach(row => {
            const jData = IFTA_TAX_RATES.jurisdictions[row.jurisdiction];
            const name  = jData ? jData.name : row.jurisdiction;
            csv += `"${name} (${row.jurisdiction})",${row.totalMiles},${row.taxableMiles},${row.taxPaidGallons},${row.taxRate.toFixed(4)},${row.taxableGallons.toFixed(3)},${row.netTaxableGallons.toFixed(3)},${row.taxDue.toFixed(2)}\n`;
        });
        const ts = new Date().toISOString().slice(0, 10);
        downloadFile(csv, `ifta-report-${appState.selectedQuarter}-${ts}.csv`, 'text/csv;charset=utf-8');
        showToast(`CSV exported with ${dataRows.length} rows`, 'success');
    } catch (error) {
        console.error('CSV export error:', error);
        showToast('Error exporting CSV file', 'error');
    }
}

// ── Excel Export ───────────────────────────────────────────────────────────

export function exportToExcel() {
    if (!appState.baseJurisdiction) {
        showToast('Please select a Base Jurisdiction before exporting.', 'warning');
        document.getElementById('baseJurisdiction')?.focus();
        return;
    }
    const dataRows = appState.rows.filter(r => r.jurisdiction);
    if (dataRows.length === 0) {
        showToast('No data to export. Please add some trip data first.', 'warning');
        return;
    }
    try {
        const IFTA_TAX_RATES = getIftaTaxRates();
        let csv = '\uFEFF';
        csv += 'IFTA Fuel Tax Report\n';
        csv += `Quarter:,${formatQuarterDisplay(appState.selectedQuarter)}\n`;
        csv += `Fuel Type:,${appState.selectedFuelType.charAt(0).toUpperCase() + appState.selectedFuelType.slice(1)}\n`;
        csv += `Fleet MPG:,${appState.fleetMpg}\n`;
        csv += `Base Jurisdiction:,${appState.baseJurisdiction}\n`;
        csv += `Generated:,${new Date().toLocaleString()}\n\n`;
        csv += 'Jurisdiction,Total Miles,Taxable Miles,Tax Paid Gallons,Tax Rate,Taxable Gallons,Net Taxable Gallons,Tax Due\n';

        let totals = { miles: 0, taxableMiles: 0, gallons: 0, taxableGallons: 0, netGallons: 0, tax: 0 };
        dataRows.forEach(row => {
            const jData = IFTA_TAX_RATES.jurisdictions[row.jurisdiction];
            const name  = jData ? jData.name : row.jurisdiction;
            csv += `"${name} (${row.jurisdiction})",${row.totalMiles},${row.taxableMiles},${row.taxPaidGallons},${row.taxRate.toFixed(4)},${row.taxableGallons.toFixed(3)},${row.netTaxableGallons.toFixed(3)},${row.taxDue.toFixed(2)}\n`;
            totals.miles         += row.totalMiles;
            totals.taxableMiles  += row.taxableMiles;
            totals.gallons       += row.taxPaidGallons;
            totals.taxableGallons += row.taxableGallons;
            totals.netGallons    += row.netTaxableGallons;
            totals.tax           += row.taxDue;
        });
        csv += `\nTOTALS,${totals.miles},${totals.taxableMiles},${roundTo(totals.gallons, 3)},,${roundTo(totals.taxableGallons, 3)},${roundTo(totals.netGallons, 3)},${roundTo(totals.tax, 2)}\n`;
        csv += `\n"Tax Status:","${totals.tax >= 0 ? 'Tax Due' : 'Credit/Refund'}",,,,,,$${Math.abs(totals.tax).toFixed(2)}\n`;

        const ts = new Date().toISOString().slice(0, 10);
        downloadFile(csv, `ifta-report-${appState.selectedQuarter}-${ts}.xlsx`, 'application/vnd.ms-excel');
        showToast(`Excel file exported with ${dataRows.length} jurisdictions`, 'success');
    } catch (error) {
        console.error('Excel export error:', error);
        showToast('Error exporting Excel file', 'error');
    }
}

// ── PDF Export ─────────────────────────────────────────────────────────────

export function exportToPdf() {
    if (!appState.baseJurisdiction) {
        showToast('Please select a Base Jurisdiction before exporting.', 'warning');
        document.getElementById('baseJurisdiction')?.focus();
        return;
    }
    const dataRows = appState.rows.filter(r => r.jurisdiction);
    if (dataRows.length === 0) {
        showToast('No data to export. Please add some trip data first.', 'warning');
        return;
    }

    const modal = document.getElementById('exportPdfModal');
    if (modal) {
        modal.classList.remove('hidden');
        if (!modal.dataset.initialized) {
            document.getElementById('closeExportPdfModal')?.addEventListener('click', () => modal.classList.add('hidden'));
            document.getElementById('cancelExportPdf')?.addEventListener('click',    () => modal.classList.add('hidden'));
            document.getElementById('confirmExportPdf')?.addEventListener('click',   () => {
                modal.classList.add('hidden');
                generatePdfWithOptions();
            });
            modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
            modal.dataset.initialized = 'true';
        }
    } else {
        generatePdfWithOptions();
    }
}

export function generatePdfWithOptions() {
    const options = {
        includeUnitNumber:  document.getElementById('pdfIncludeUnitNumber')?.checked  ?? true,
        includeFleetMpg:    document.getElementById('pdfIncludeFleetMpg')?.checked    ?? true,
        includeCurrentMpg:  document.getElementById('pdfIncludeCurrentMpg')?.checked  ?? true,
        includeTaxRates:    document.getElementById('pdfIncludeTaxRates')?.checked    ?? false,
        includeSummary:     document.getElementById('pdfIncludeSummary')?.checked     ?? true
    };

    const dataRows = appState.rows.filter(r => r.jurisdiction);
    if (typeof window.jspdf === 'undefined') {
        showToast('PDF library loading... please try again in a moment.', 'warning');
        return;
    }

    try {
        const IFTA_TAX_RATES = getIftaTaxRates();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const primaryColor = [91, 155, 213];
        const positiveTax  = [198, 40, 40];
        const negativeTax  = [46, 125, 50];

        doc.setFontSize(22);
        doc.setTextColor(...primaryColor);
        doc.text('IFTA Fuel Tax Report', 14, 22);
        doc.setDrawColor(...primaryColor);
        doc.setLineWidth(0.5);
        doc.line(14, 26, 196, 26);

        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);

        let infoY = 35;
        const col1X = 14, col2X = 110;

        doc.setFont(undefined, 'bold');
        doc.text('Quarter:', col1X, infoY);
        doc.setFont(undefined, 'normal');
        doc.text(formatQuarterDisplay(appState.selectedQuarter), col1X + 30, infoY);

        doc.setFont(undefined, 'bold');
        doc.text('Fuel Type:', col1X, infoY + 6);
        doc.setFont(undefined, 'normal');
        doc.text(appState.selectedFuelType.charAt(0).toUpperCase() + appState.selectedFuelType.slice(1), col1X + 30, infoY + 6);

        let row = 2;
        if (options.includeFleetMpg) {
            doc.setFont(undefined, 'bold'); doc.text('Fleet MPG:', col1X, infoY + (row * 6));
            doc.setFont(undefined, 'normal'); doc.text(String(appState.fleetMpg), col1X + 30, infoY + (row * 6));
            row++;
        }
        if (options.includeCurrentMpg && appState.currentMpg > 0) {
            doc.setFont(undefined, 'bold'); doc.text('Current MPG:', col1X, infoY + (row * 6));
            doc.setFont(undefined, 'normal'); doc.text(appState.currentMpg.toFixed(2), col1X + 30, infoY + (row * 6));
            row++;
        }

        doc.setFont(undefined, 'bold'); doc.text('Base Jurisdiction:', col2X, infoY);
        doc.setFont(undefined, 'normal'); doc.text(appState.baseJurisdiction, col2X + 40, infoY);
        doc.setFont(undefined, 'bold'); doc.text('Report Date:', col2X, infoY + 6);
        doc.setFont(undefined, 'normal'); doc.text(new Date().toLocaleDateString(), col2X + 40, infoY + 6);
        if (options.includeUnitNumber && appState.unitNumber) {
            doc.setFont(undefined, 'bold'); doc.text('Unit #:', col2X, infoY + 12);
            doc.setFont(undefined, 'normal'); doc.text(appState.unitNumber, col2X + 40, infoY + 12);
        }

        const tableData = [];
        let totals = { miles: 0, taxableMiles: 0, gallons: 0, taxableGallons: 0, netGallons: 0, tax: 0 };
        dataRows.forEach(r => {
            const jData = IFTA_TAX_RATES.jurisdictions[r.jurisdiction];
            const name  = jData ? `${jData.name} (${r.jurisdiction})` : r.jurisdiction;
            tableData.push([name, formatNumber(r.totalMiles), formatNumber(r.taxableMiles),
                formatGallons(r.taxPaidGallons), formatRate(r.taxRate),
                formatGallons(r.taxableGallons), formatGallons(r.netTaxableGallons), formatCurrency(r.taxDue)]);
            totals.miles          += r.totalMiles || 0;
            totals.taxableMiles   += r.taxableMiles || 0;
            totals.gallons        += r.taxPaidGallons || 0;
            totals.taxableGallons += r.taxableGallons || 0;
            totals.netGallons     += r.netTaxableGallons || 0;
            totals.tax            += r.taxDue || 0;
        });
        tableData.push(['TOTALS', formatNumber(totals.miles), formatNumber(totals.taxableMiles),
            formatGallons(totals.gallons), '—', formatGallons(totals.taxableGallons),
            formatGallons(totals.netGallons), formatCurrency(totals.tax)]);

        const tableStartY = infoY + (Math.max(row, 3) * 6) + 10;
        doc.autoTable({
            startY: tableStartY,
            head: [['Jurisdiction','Total Miles','Taxable Miles','Tax Paid Gal','Rate','Taxable Gal','Net Taxable','Tax Due']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 8 },
            alternateRowStyles: { fillColor: [250, 250, 250] },
            columnStyles: {
                0: { cellWidth: 40 }, 1: { halign: 'right', cellWidth: 20 },
                2: { halign: 'right', cellWidth: 22 }, 3: { halign: 'right', cellWidth: 20 },
                4: { halign: 'right', cellWidth: 18 }, 5: { halign: 'right', cellWidth: 20 },
                6: { halign: 'right', cellWidth: 20 }, 7: { halign: 'right', cellWidth: 22 }
            },
            didParseCell(data) {
                if (data.row.index === tableData.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [232, 245, 233];
                }
                if (data.column.index === 7 && data.section === 'body') {
                    const value = parseFloat(data.cell.raw.replace(/[$,]/g, ''));
                    if (value > 0) data.cell.styles.textColor = positiveTax;
                    else if (value < 0) data.cell.styles.textColor = negativeTax;
                }
            },
            margin: { left: 14, right: 14 }
        });

        let finalY = doc.lastAutoTable.finalY + 10;

        if (options.includeSummary) {
            doc.setFontSize(12); doc.setTextColor(...primaryColor);
            doc.text('Summary', 14, finalY); finalY += 6;
            doc.setFontSize(9); doc.setTextColor(80, 80, 80);
            doc.text(`Total Jurisdictions: ${dataRows.length}`, 14, finalY);
            doc.text(`Total Miles: ${formatNumber(totals.miles)}`, 80, finalY); finalY += 5;
            doc.text(`Total Tax Paid Gallons: ${formatGallons(totals.gallons)}`, 14, finalY);
            doc.text(`Net Tax: ${formatCurrency(totals.tax)}`, 80, finalY); finalY += 10;
        }

        if (options.includeTaxRates) {
            if (finalY > 200) { doc.addPage(); finalY = 20; }
            doc.setFontSize(12); doc.setTextColor(...primaryColor);
            doc.text('Tax Rates Reference', 14, finalY); finalY += 6;
            const ratesData = Object.keys(IFTA_TAX_RATES.jurisdictions).sort().map(code => {
                const j = IFTA_TAX_RATES.jurisdictions[code];
                return [`${j.name} (${code})`, formatRate(j.rates.diesel), formatRate(j.rates.gasoline), formatRate(j.rates.propane)];
            });
            doc.autoTable({
                startY: finalY,
                head: [['Jurisdiction','Diesel','Gasoline','Propane']],
                body: ratesData,
                theme: 'striped',
                headStyles: { fillColor: [100,100,100], textColor: 255, fontSize: 8 },
                bodyStyles: { fontSize: 7 },
                columnStyles: { 0:{cellWidth:60}, 1:{halign:'right',cellWidth:25}, 2:{halign:'right',cellWidth:25}, 3:{halign:'right',cellWidth:25} },
                margin: { left: 14, right: 14 }
            });
            finalY = doc.lastAutoTable.finalY + 10;
        }

        if (finalY > 270) { doc.addPage(); finalY = 20; }
        doc.setFontSize(8); doc.setTextColor(120,120,120);
        doc.text('Generated by IFTA Wizard | Tax rates sourced from IFTA, Inc.', 14, finalY);
        doc.text('Disclaimer: This report is for estimation purposes only. Verify all rates with official sources before filing.', 14, finalY + 4);

        const ts         = new Date().toISOString().slice(0, 10);
        const unitSuffix = appState.unitNumber ? `-Unit${appState.unitNumber}` : '';
        doc.save(`IFTA-Report-${appState.selectedQuarter.replace(' ', '-')}${unitSuffix}-${ts}.pdf`);
        showToast('PDF downloaded successfully!', 'success');

    } catch (error) {
        console.error('PDF export error:', error);
        showToast('Error generating PDF. Please try again.', 'error');
    }
}

// ── Print ──────────────────────────────────────────────────────────────────

export function printReportAsPdf() {
    const dataRows = appState.rows.filter(r => r.jurisdiction);
    if (dataRows.length === 0) { showToast('No data to export.', 'warning'); return; }

    const printWindow = window.open('', '_blank');
    if (!printWindow) { showToast('Popup blocked! Please allow popups.', 'error'); return; }

    const IFTA_TAX_RATES = getIftaTaxRates();
    let totals = { miles: 0, taxableMiles: 0, gallons: 0, taxableGallons: 0, netGallons: 0, tax: 0 };
    let rowsHtml = '';

    dataRows.forEach(row => {
        const jData = IFTA_TAX_RATES.jurisdictions[row.jurisdiction];
        const name = jData ? jData.name : row.jurisdiction;
        const displayTaxDue = getDisplayTaxDue(row.taxDue, row.jurisdiction);
        const taxClass = displayTaxDue >= 0 ? 'positive' : 'negative';
        rowsHtml += `<tr><td>${name} (${row.jurisdiction})</td><td>${formatNumber(row.totalMiles)}</td><td>${formatNumber(row.taxableMiles)}</td><td>${formatGallons(row.taxPaidGallons)}</td><td>${formatRate(row.taxRate)}</td><td>${formatGallons(row.taxableGallons)}</td><td>${formatGallons(row.netTaxableGallons)}</td><td class="${taxClass}">${formatCurrency(displayTaxDue)}</td></tr>`;
        totals.miles += row.totalMiles || 0; totals.taxableMiles += row.taxableMiles || 0;
        totals.gallons += row.taxPaidGallons || 0; totals.taxableGallons += row.taxableGallons || 0;
        totals.netGallons += row.netTaxableGallons || 0;
        totals.tax += getDisplayTaxDue(row.taxDue || 0, row.jurisdiction);
    });

    const totalTaxClass = totals.tax >= 0 ? 'positive' : 'negative';
    const html = `<!DOCTYPE html><html><head><title>IFTA Report - ${appState.selectedQuarter}</title><style>body{font-family:Arial,sans-serif;padding:20px}h1{color:#5b9bd5}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#5b9bd5;color:white}.totals{background:#e8f5e9;font-weight:bold}.positive{color:#c62828}.negative{color:#2e7d32}.info p{margin:5px 0}@media print{body{padding:0}}</style></head><body><h1>IFTA Fuel Tax Report</h1><div class="info"><p><strong>Quarter:</strong> ${formatQuarterDisplay(appState.selectedQuarter)}</p><p><strong>Fuel Type:</strong> ${appState.selectedFuelType}</p><p><strong>Fleet MPG:</strong> ${appState.fleetMpg}</p><p><strong>Base Jurisdiction:</strong> ${appState.baseJurisdiction}</p><p><strong>Generated:</strong> ${new Date().toLocaleString()}</p></div><table><thead><tr><th>Jurisdiction</th><th>Total Miles</th><th>Taxable Miles</th><th>Tax Paid Gallons</th><th>Rate</th><th>Taxable Gal</th><th>Net Taxable</th><th>Tax Due/Credit</th></tr></thead><tbody>${rowsHtml}<tr class="totals"><td>TOTALS</td><td>${formatNumber(totals.miles)}</td><td>${formatNumber(totals.taxableMiles)}</td><td>${formatGallons(totals.gallons)}</td><td>—</td><td>${formatGallons(totals.taxableGallons)}</td><td>${formatGallons(totals.netGallons)}</td><td class="${totalTaxClass}">${formatCurrency(totals.tax)}</td></tr></tbody></table><p style="margin-top:30px;font-size:12px;color:#666">Generated by IFTA Wizard | Disclaimer: For estimation purposes only.</p><script>window.print();window.onafterprint=function(){window.close()}<\/script></body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
}

export function printReport() { window.print(); }
