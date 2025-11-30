# IFTA Wizard

A web-based IFTA (International Fuel Tax Agreement) fuel tax calculator for interstate motor carriers.

![IFTA Wizard Screenshot](screenshot.png)

## Features

- **Complete Tax Rate Database**: Current Q4 2025 tax rates for all 48 US states and 10 Canadian provinces
- **Multiple Fuel Types**: Support for Diesel, Gasoline, Gasohol, Propane, LNG, CNG, Ethanol, Methanol, and Biodiesel
- **Automatic Calculations**: 
  - Taxable gallons based on fleet MPG
  - Net taxable gallons (consumption minus purchases)
  - Tax due or credit per jurisdiction
- **Data Management**:
  - Add/delete jurisdiction rows
  - Import data from CSV
  - Save/load sessions in browser
- **Export Options**:
  - Export to CSV
  - Export to Excel
  - Generate PDF report
  - Print report
- **Tax Rate Reference**: Searchable table of all current IFTA tax rates
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## How to Use

### 1. Configure Your Trip
- Select the **Reporting Quarter** (e.g., Q4 2025)
- Choose your **Fuel Type** (default: Diesel)
- Set your **Base Jurisdiction**
- Enter your **Fleet Average MPG**

### 2. Enter Jurisdiction Data
For each state/province you traveled through:
1. Select the **Jurisdiction** from the dropdown
2. Enter **Total Miles** traveled in that jurisdiction
3. Enter **Taxable Miles** (usually same as total unless exempt miles exist)
4. Enter **Tax Paid Gallons** (fuel purchased in that jurisdiction)

The calculator will automatically compute:
- **Tax Rate**: Current rate for that jurisdiction and fuel type
- **Taxable Gallons**: Based on your fleet MPG
- **Net Taxable Gallons**: Taxable gallons minus tax-paid gallons
- **Tax Due/Credit**: Net taxable gallons × tax rate

### 3. Review Results
- Summary cards show total miles, gallons, overall MPG, and net tax due
- Positive amounts = tax owed (shown in red)
- Negative amounts = tax credit (shown in green)

### 4. Export Your Report
- **PDF**: Generates a printable report
- **CSV**: Simple comma-separated values
- **Excel**: Formatted spreadsheet
- **Print**: Direct print from browser

## Tax Rate Data

Tax rates are sourced from [IFTA, Inc.](https://www.iftach.org/taxmatrix4/) and updated quarterly.

**Current Quarter**: Q4 2025 (October - December 2025)

**Exchange Rates**:
- US to Canada: 1.3797
- Canada to US: 0.7248

### Important Notes

1. **Montana**: Does not require gasoline/gasohol reporting for IFTA
2. **Canadian Rates**: Shown in USD (converted from CAD using exchange rate)
3. **Alternative Fuels**: Some jurisdictions have special rules for LNG, CNG, and propane
4. **Rate Changes**: Check official IFTA sources before filing as rates may change

## Running Locally

Simply open `index.html` in any modern web browser. No server required!

For development with live reload:
```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve

# Using PHP
php -S localhost:8000
```

Then open http://localhost:8000 in your browser.

## File Structure

```
IFTA-Wizard/
├── index.html      # Main application HTML
├── styles.css      # CSS styles
├── app.js          # Main application logic
├── tax-rates.js    # IFTA tax rate database
├── README.md       # This file
└── CNAME           # GitHub Pages custom domain
```

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Data Storage

Session data is stored in browser localStorage. Your data never leaves your device.

## Disclaimer

This tool is for **estimation and planning purposes only**. Always verify tax rates with official IFTA sources before filing your quarterly tax return. Tax rates and rules may change without notice.

## License

MIT License - Feel free to use, modify, and distribute.

## Credits

- Tax rate data: [IFTA, Inc.](https://www.iftach.org/)
- Fonts: [Google Fonts - Inter](https://fonts.google.com/specimen/Inter)
- Icons: Custom SVG icons

## Contributing

Contributions welcome! Please submit issues and pull requests on GitHub.

---

Made with ❤️ for the trucking industry
