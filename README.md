# Obsidian Hledger

A plugin for [Obsidian](https://obsidian.md) that allows you to create and manage [hledger](https://hledger.org/) transactions directly within your vault.

## Features

### Transaction Management
- Create both regular and exchange transactions
- Fuzzy account name suggestions from your accounts file
- Automatic balance calculation for transaction entries
- Support for multiple currencies

### Daily Notes Integration
- Automatically detect dates from daily note filenames
- Organize transactions within daily notes using a dedicated section
- Configurable date format for daily notes

### Import/Export Functionality
- Export transactions from daily notes to hledger journal files
- Import transactions from journal files back to daily notes

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
5. Click "Submit" to save

### Managing Accounts
- Create an accounts file (e.g., `accounts`)
- List accounts using the format: `account Assets:Bank`
- Set the accounts file path in plugin settings

### Exporting to Journal
1. Use the "Export transactions from daily notes to journal file" command
2. Select date range
3. Enter journal filename
4. Choose whether to replace existing file

### Importing from Journal
1. Use the "Import transactions from journal file to daily notes" command
2. Select date range
3. Choose source journal file
4. Transactions will be imported to corresponding daily notes

## Installation

1. Open Obsidian Settings
2. Navigate to Community Plugins
3. Search for "Hledger"
4. Click Install
5. Enable the plugin

## Requirements

- Obsidian v0.15.0 or higher
- For optimal use, familiarity with hledger's journal format

## License

This project is licensed under the MIT License. 