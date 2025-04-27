# Hledger Notes

An [Obsidian](https://obsidian.md) plugin for managing [hledger](https://hledger.org/) transactions within your vault.

## Features

### Transaction Management
- Create both regular and exchange transactions
- Fuzzy account name suggestions from your accounts file
- Automatic balance calculation for transaction entries
- Support for multiple currencies
- Shortcuts for entering amounts ('k' for thousands, 'm' for millions)

### Daily Notes Integration
- Automatically detect dates from daily note filenames
- Organize transactions within daily notes using a dedicated section
- Configurable date format for daily notes
- Support for hierarchical date formats (e.g., YYYY-MM/YYYY-MM-DD)

### Import/Export Functionality
- Export transactions from daily notes to hledger journal files
- Import transactions from journal files back to daily notes

## Usage

### Installation
1. Open Obsidian Settings → Community Plugins
2. Search for "Hledger", install and enable

### Settings
- Create an [accounts file](https://hledger.org/1.42/hledger.html#account-types) to enable autosuggest feature for account names and set the path in plugin settings
- Set Daily notes folder path and date format for daily notes
- Set hledger folder path in your vault (used for importing and exporting tasks)
- Set up currencies, formats and placements for transactions

### Adding Transactions
1. Use "$" icon or "Add hledger Entry" command
2. Select transaction type and enter details
3. Use 'k'/'m' shortcuts for large amounts (e.g., '5k' → 5,000, '2.5m' → 2,500,000)
4. Submit with button or Ctrl/Cmd+Enter

### Exporting/Importing
- Use dedicated commands to transfer transactions between daily notes and journal files
- Select date range and specify file options
- Use keyboard shortcuts (Ctrl/Cmd+Enter) for quick execution


## Support

Feel free to create Pull requests on this repo for fixes/improvement or you can support me by clicking the button below:

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="BuyMeACoffee" width="100">](https://www.buymeacoffee.com/bzimor)