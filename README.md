# IFTA Wizard

> Web-based IFTA fuel tax calculator and fleet operations hub for interstate motor carriers.

**Live:** [www.logistixnerd.com](https://www.logistixnerd.com) · [ifta-wizard-a9061.web.app](https://ifta-wizard-a9061.web.app)

---

## Overview

IFTA Wizard started as a static HTML fuel tax calculator and has grown into a Firebase-backed fleet management platform. The core calculator computes quarterly IFTA tax obligations across all 48 contiguous US states and 10 Canadian provinces. Surrounding that are fleet registry, driver profiles, dispatch tracking, compliance tools, and a full operations dashboard — all secured behind Firebase Authentication.

The intended audience is owner-operators, small-to-medium fleets, and the staff (dispatchers, accountants, safety coordinators) who support them.

---

## Current Features

### IFTA Calculator
- Current quarterly tax rates for all 48 US states + 10 Canadian provinces
- Fuel types: Diesel, Gasoline, Gasohol, Propane, LNG, CNG, Ethanol, Methanol, Biodiesel
- Auto-calculates taxable gallons (based on fleet MPG), net taxable gallons, and tax due or credit per jurisdiction
- Import rows from CSV or paste directly from an Excel spreadsheet
- Export: PDF report, Excel, CSV, browser print
- Save/restore sessions in browser local storage

### Authentication & Access Control
- Google Sign-In (OAuth redirect) via Firebase Auth
- Email/password sign-up and sign-in
- Role-based access: `user`, `moderator`, `admin`
- Admin panel at `admin.html` — restricted by role claim
- Session timeout and auth guards across all pages

### Fleet Management
- Firestore-backed truck and trailer registry
- Driver profiles, driver assignments, onboarding workflow
- Unit profiles linked to IFTA reporting (fuel type pulled per unit)
- Hiring pipeline and applications tracking

### Dashboard & Operations
A unified dashboard (`dashboard.html`) with a collapsible side-nav covering:

| Category | Sections |
|---|---|
| Overview | Live overview, command center, tracking, live map |
| Dispatch | Dispatch board, active loads, load status, ETA tracking |
| Fleet | Trucks, trailers, maintenance, PM schedules, work orders, parts inventory |
| People | Drivers, assignments, onboarding, hiring, driver support, on-call, after-hours, emergency contacts |
| Finance | Accounting, payroll, settlements, invoices, expenses |
| Compliance | Compliance, safety, insurance, cargo claims, accidents |
| Other | Reports, settings, bulk docs, company info, cross-dept alerts |

### Google Integrations
- **Google Drive** — import fuel reports and PDF files from Drive
- **Google Maps** — route calculation, live map view, zip-code to jurisdiction resolution
- **PDF.js** — extract mileage/fuel data from uploaded PDF reports

### Cloud Functions
- `/api/mclookup` — FMCSA carrier lookup by MC or DOT number (proxied to protect API key)
- `/api/samsara/callback` — Samsara ELD OAuth callback handler
- Secrets stored in Firebase Secret Manager (not in source)

---

## Architecture

```
Browser
├── Global scripts (loaded first, non-module)
│   ├── firebase-config.js       Firebase compat SDK init + globals
│   ├── security.js              CSP / integrity helpers
│   ├── tax-rates.js             IFTA rate data (window globals)
│   ├── auth-firebase.js         Auth UI + session management
│   └── reports.js               Saved report helpers
│
└── src/main.js  (type="module" — IFTA calculator entry point)
    ├── src/core/                Pure logic, no DOM
    │   ├── calculator.js        Pure IFTA math (zero imports)
    │   ├── state.js             Mutable app state singleton
    │   ├── constants.js         Shared numeric constants
    │   ├── formatters.js        Display formatting
    │   ├── validators.js        Input sanitisation
    │   └── tax-utils.js         Wrappers over window tax-rate globals
    ├── src/ui/                  DOM modules
    │   ├── table.js             Editable jurisdiction table
    │   ├── header.js            Quarter/jurisdiction dropdowns
    │   ├── rates-table.js       Tax rate reference table
    │   └── toast.js             Notification toasts
    └── src/features/            Side-effect modules
        ├── exports.js           CSV / Excel / PDF / print
        ├── local-storage.js     Save / load sessions
        ├── fleet.js             Firestore truck dropdown
        └── offline.js           Online/offline detection

Firebase
├── Hosting          Static files + rewrite rules → Cloud Functions
├── Auth             Google + Email/Password providers
├── Firestore        Fleet data, saved reports, user profiles
├── Storage          Uploaded documents
└── Cloud Functions  FMCSA proxy, Samsara OAuth (Node.js Gen 1)

External APIs
├── FMCSA QCMobile   Carrier safety data (public key, proxied)
├── Google Maps      Route calc, live map, zip resolution
├── Google Drive     Report import
└── Samsara ELD      Mileage-by-jurisdiction (OAuth)
```

---

## Folder Structure

```
IFTA-Wizard/
├── index.html              IFTA calculator (main entry point)
├── dashboard.html          Fleet operations dashboard
├── admin.html              Admin panel (role-restricted)
├── about.html / terms.html / privacy.html
├── driver-profile.html     Driver profile view
├── trailer-profile.html    Trailer profile view
├── unit-profile.html       Unit (truck) profile view
├── task-manager.html       Internal task manager
│
├── src/                    ES module source (see Architecture above)
│   ├── core/
│   ├── ui/
│   └── features/
│
├── pages/                  Dashboard sub-section pages (40+ HTML files)
│   ├── trucks.html / trailers.html / drivers.html
│   ├── dispatch.html / dispatch-board.html / active-loads.html
│   ├── maintenance.html / work-orders.html / parts-inventory.html
│   ├── payroll.html / settlements.html / invoices.html / expenses.html
│   └── ... (compliance, safety, hiring, reports, settings, etc.)
│
├── functions/              Firebase Cloud Functions
│   ├── index.js            mcLookup + samsaraCallback
│   └── package.json
│
├── firebase-config.js      Firebase project config + initializeFirebase()
├── auth-firebase.js        Auth module (IFTAAuth object)
├── tax-rates.js            IFTA rate data + calculation helpers
├── reports.js              Saved report helpers
├── security.js             Integrity / CSP helpers
├── integrity-monitor.js    Runtime integrity checks
│
├── styles.css              Calculator styles
├── dashboard.css           Dashboard styles
├── admin.css               Admin panel styles
├── unit-profile.css        Unit profile styles
│
├── firebase.json           Hosting, Functions, Firestore, Storage config
├── firestore.rules         Firestore security rules
├── firestore.indexes.json  Composite indexes
├── storage.rules           Storage security rules
├── cors.json               CORS config for Storage
└── app.js                  Legacy calculator entry (superseded by src/main.js)
```

---

## Local Development

**Prerequisites:** Node.js ≥ 18, [Firebase CLI](https://firebase.google.com/docs/cli)

```bash
git clone https://github.com/your-org/IFTA-Wizard.git
cd IFTA-Wizard
```

### Option A — Calculator only (no auth required)

Serve the root directory with any static server:

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .

# Firebase CLI
firebase serve --only hosting
```

Open `http://localhost:8000`. Authentication is bypassed in local file serving — the calculator works without signing in.

### Option B — Full stack (auth + Firestore + Functions)

```bash
npm install -g firebase-tools
firebase login
firebase emulators:start
```

This starts the Auth emulator, Firestore emulator, and Functions emulator together. Open `http://localhost:5000`.

> **Note:** `firebase-config.js` contains the live project's API key. The key is restricted by HTTP referrer in GCP Console so it is safe in source, but do not reuse it for a forked project — create your own Firebase project and replace the config values.

---

## Firebase Setup

Follow these steps when setting up a new Firebase project for a fork or self-hosted deployment.

**1. Create a Firebase project**
Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project.

**2. Update `firebase-config.js`**
Replace the `firebaseConfig` object with your project's values (found in Project Settings → Your apps → Web app).

**3. Enable Authentication providers**
In the Firebase Console → Authentication → Sign-in method:
- Enable **Google**
- Enable **Email/Password**

**4. Set up Firestore**
- Create a Firestore database (production mode, region `nam5` or your preferred region)
- Deploy rules and indexes:
```bash
firebase deploy --only firestore
```

**5. Set up Storage**
```bash
firebase deploy --only storage
```

**6. Configure CORS for Storage**
```bash
node functions/set-cors.js
```

**7. Set admin emails**
In `firebase-config.js`, update the `ADMIN_EMAILS` array with the Google/email accounts that should have admin access.

**8. Deploy Cloud Functions**
```bash
cd functions && npm install && cd ..
firebase deploy --only functions
```

**9. Set required secrets** (Functions will fail without these)
```bash
firebase functions:secrets:set FMCSA_API_KEY
firebase functions:secrets:set SAMSARA_CLIENT_ID
firebase functions:secrets:set SAMSARA_CLIENT_SECRET
```
The FMCSA public web key is already in `firebase-config.js`; use it as the value for `FMCSA_API_KEY` or obtain your own from [FMCSA](https://mobile.fmcsa.dot.gov/QCDevsite/docs/qcguide.pdf).

---

## Deployment

Deploy everything in one command:

```bash
firebase deploy
```

Or deploy selectively:

```bash
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

The live site is served from Firebase Hosting with a custom domain (`www.logistixnerd.com`) configured via the `CNAME` file. Firebase's CDN handles HTTPS automatically.

---

## Security Notes

- **API key exposure:** The Firebase API key in `firebase-config.js` is intentionally public — it identifies the project, not a secret credential. Access is controlled by Firestore rules, Auth providers, and HTTP referrer restrictions set in GCP Console.
- **Firestore rules:** `firestore.rules` enforces per-user data isolation. Users can only read and write their own documents. Admin operations require a verified role claim.
- **Admin panel:** `admin.html` is protected by a role check in `auth-firebase.js` and by Firestore rules. Being on the `ADMIN_EMAILS` list alone is not sufficient after first sign-in — the role must be stored in Firestore.
- **Cloud Functions:** No secrets are hardcoded. `FMCSA_API_KEY`, `SAMSARA_CLIENT_ID`, and `SAMSARA_CLIENT_SECRET` are managed via Firebase Secret Manager and injected at runtime.
- **CORS:** `cors.json` restricts Storage access to allowed origins. Run `set-cors.js` after any origin changes.

---

## Roadmap

- [ ] Firestore-backed IFTA report cloud save/load (replace local-storage-only approach)
- [ ] Scheduled Cloud Function for automatic quarterly rate updates
- [ ] Samsara ELD mileage-by-jurisdiction auto-import
- [ ] Multi-truck IFTA batch reporting (one filing covering entire fleet)
- [ ] State-specific PDF filing template output
- [ ] Progressive Web App improvements: full offline support, install prompt
- [ ] Automated FMCSA compliance monitoring alerts

---

## License

MIT

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
