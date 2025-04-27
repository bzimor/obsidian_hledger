# Hledger Notes

A plugin for [Obsidian](https://obsidian.md) that allows you to create and manage [hledger](https://hledger.org/) transactions directly within your vault.

## Features

### Transaction Management
- Create both regular and exchange transactions
- Fuzzy account name suggestions from your accounts file
- Automatic balance calculation for transaction entries
- Support for multiple currencies
- Shortcuts for entering amounts ('k' for thousands, 'm' for millions)
- Keyboard shortcut for quick submitting (Ctrl + Enter on Windows/Linux, Cmd + Enter on Mac)

### Daily Notes Integration
- Automatically detect dates from daily note filenames
- Organize transactions within daily notes using a dedicated section
- Configurable date format for daily notes
- Support for hierarchical date formats (e.g., YYYY-MM/YYYY-MM-DD)

### Import/Export Functionality
- Export transactions from daily notes to hledger journal files
- Import transactions from journal files back to daily notes
- Support for hierarchical folder structures
- Validation of date ranges and file names
- Keyboard shortcuts for quick export/import (Ctrl + Enter)

### Formatting Options
- Configurable number formats:
  - Comma-dot (1,234.56)
  - Space-comma (1 234,56)
  - Dot-comma (1.234,56)
- Customizable currency placement (before/after amount)
- Optional spacing between currency and amount
- Configurable line length for transaction entries

## Settings

### Daily Note Settings
- Daily notes folder path
- Date format for daily note filenames (using [Moment.js format](https://momentjs.com/docs/#/displaying/format/))
- Transaction section header text

### Transaction Settings
- List of available currencies
- Option to include date in transactions
- Transaction line length
- Amount format (comma-dot, space-comma, dot-comma)
- Currency placement (before/after amount)
- Currency spacing

### Hledger Settings
- Journal folder path
- Accounts file path
- Hledger Date Format (using [Moment.js format](https://momentjs.com/docs/#/displaying/format/))

## Usage

### Adding Transactions
1. Click the "$" icon in the ribbon or use the command "Add hledger Entry"
2. Select transaction type (regular or exchange)
3. Enter date and description
4. Add account entries with amounts and currencies
   - Use 'k' for thousands (e.g., '5k' becomes '5000')
   - Use 'm' for millions (e.g., '2.5m' becomes '2500000')
5. Click "Submit" or use the keyboard shortcut (Ctrl+Enter on Windows/Linux, Cmd+Enter on Mac) to save

### Managing Accounts
- Create an accounts file (e.g., `accounts`)
- List accounts using the format: `account Assets:Bank`
- Set the accounts file path in plugin settings

### Exporting to Journal
1. Use the "Export transactions from daily notes to journal file" command
2. Select date range
3. Enter journal filename
4. Choose whether to replace existing file
5. Use Ctrl+Enter (Windows/Linux) or Cmd+Enter (Mac) as a shortcut to export with current settings

### Importing from Journal
1. Use the "Import transactions from journal file to daily notes" command
2. Select date range
3. Choose source journal file
4. Transactions will be imported to corresponding daily notes
5. Use Ctrl+Enter (Windows/Linux) or Cmd+Enter (Mac) as a shortcut to import with current settings

### Using Hierarchical Date Formats
1. In settings, set your daily notes date format to include a folder structure (e.g., "YYYY-MM/YYYY-MM-DD")
2. Organize your notes in corresponding folders (e.g., "Daily notes/2023-01/2023-01-15.md")
3. The plugin will correctly match and process files based on this structure

### Amount Shortcuts
The plugin supports convenient shortcuts for entering large numbers quickly:

- Use 'k' as a suffix for thousands:
  - '1k' → 1,000
  - '1.5k' → 1,500
  - '10k' → 10,000

- Use 'm' as a suffix for millions:
  - '1m' → 1,000,000
  - '2.5m' → 2,500,000
  
These shortcuts work in both the regular transaction and exchange transaction forms, saving time when entering large financial amounts.

## Installation

1. Open Obsidian Settings
2. Navigate to Community Plugins
3. Search for "Hledger"
4. Click Install
5. Enable the plugin

## Requirements

- Obsidian v0.15.0 or higher
- For optimal use, familiarity with hledger's journal format

## Support

Feel free to create Pull requests on this repo for fixes/improvement or you can buy me a coffee using this button

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="BuyMeACoffee" width="100">](https://www.buymeacoffee.com/bzimor)