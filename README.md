# Browser Extention: Spare Parts Price Automation

Browser extensions for Chrome and Edge that search principal portals using part numbers from Excel and export extracted prices into the original workbook.

Developed as a practical automation project alongside ongoing work on D-PRIME, a spare parts replenishment tool that combines demand forecasting with inventory planning.

## Features

- Read complete part numbers from the **FOB** sheet, column A, starting at row 2.
- Keep identifiers with slashes, hyphens and suffixes intact.
- Raymond: select the first result under **all parts starting** and extract **Your Price**.
- BT: open replacement parts when the original part has expired and extract the main EUR price, excluding the small per-PCE amount.
- Retain the original requested part number when using a BT replacement price.
- Update the FOB output with **Part Number** in column A and the extracted price in column B.
- Preserve the workbook's other sheets.
- Place NOT_FOUND and REVIEW_REQUIRED entries below successfully priced parts.

**FOB is the workbook's output label. The extensions do not verify the commercial shipping terms of the portal price.**

## Repository structure

- `extensions/raymond/`: Raymond Click Test v0.1.1
- `extensions/bt/`: BT Click Test v0.1.6

Both folders contain a Manifest V3 extension. No Python installation or build step is required.

## Installation

1. Download and extract the repository.
2. In Chrome, open `chrome://extensions`. In Edge, open `edge://extensions`.
3. Enable **Developer mode**, then select **Load unpacked**.
4. Choose `extensions/raymond` or `extensions/bt`.
5. Sign in to the relevant portal through your browser and open its parts search page.

The extensions use your existing browser login session. They do not contain or ask you to enter a portal password.

## Usage

1. Activate the logged-in portal tab and open the extension.
2. Open the extraction window.
3. To process Excel, leave the test part number field empty and choose your `.xlsx` workbook.
4. Select **Mulai** (Start).
5. Keep the extraction window open. Avoid other searches in the target portal tab during processing.
6. Select **Download Excel** when finished. The original input workbook must remain selected for export.

To try a single part, enter a part number instead. Workbook export still requires an input Excel file with an FOB sheet.

BT also offers **Lewati PN** (Skip part) and **Download Pemeriksaan** (Download diagnostics).

## Implementation

JavaScript inspects the portal DOM, identifies the relevant search results and prices, and triggers page interactions. Browser APIs read and write the Excel ZIP/XML package without an external spreadsheet library.

Output uses the portal currency: Raymond USD and BT EUR. There is no currency conversion or shipping/tax calculation.

## Validation and limitations

- The developer observed successful automated Raymond searches and BT replacement-part opening during manual browser testing.
- The code is specific to each portal's current DOM and may require changes if the website layout changes.
- Raymond can wait until a result appears or the user stops the process.
- BT labels a blank search **NOT_FOUND** after 10 seconds of an apparently ready page without visible loading or error indicators. This is a display-based heuristic, not backend confirmation. A slow request could therefore produce a false NOT_FOUND.
- Confirm extracted results against the source before using them for operational decisions.
- The Excel reader deduplicates repeated part numbers. The FOB sheet is rebuilt as an output list rather than preserving its original row order or formatting.
- Complex workbook tables, macros and sheet relationships have not been comprehensively tested.

## Public portfolio data

This repository contains source code and documentation only. It does not include internal prices, order workbooks, customer data, browser sessions, screenshots or diagnostic exports.

The optional test fields are blank in this public copy. No internal sample part list is included.

The extensions show and store extracted prices locally during use. A diagnostic download can also contain prices and part numbers. These runtime files are private working data and must not be committed to this repository.

## Project learning

DOM inspection, browser extension development, Excel automation and troubleshooting portal-specific interactions.

This project is independent of the portal providers and is not an official Raymond, Toyota or BT product.
