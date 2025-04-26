import { App, Modal, TFile, FuzzySuggestModal, Notice } from 'obsidian';
import { HledgerSettings } from '../settings';
import moment from 'moment';


class AccountSuggestModal extends FuzzySuggestModal<string> {
    private accounts: string[];
    private onChoose: (item: string) => void;

    constructor(app: App, accounts: string[], onChoose: (item: string) => void) {
        super(app);
        this.accounts = accounts;
        this.onChoose = onChoose;
    }

    getItems(): string[] {
        return this.accounts;
    }

    getItemText(item: string): string {
        return item;
    }

    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }
}

export class HledgerEntryModal extends Modal {
    date: string;
    description: string;
    entries: { account: string; amount: number; currency: string }[];
    onSubmit: (date: string, description: string, entries: { account: string; amount: number; currency: string }[]) => void;
    settings: HledgerSettings;
    accounts: string[] = [];
    isExchange: boolean;
    exchangeAmount: number | null;

    constructor(
        app: App,
        settings: HledgerSettings,
        onSubmit: (date: string, description: string, entries: { account: string; amount: number; currency: string }[]) => void
    ) {
        super(app);
        this.settings = settings;
        this.onSubmit = onSubmit;
        
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            const basename = activeFile.basename.replace('.md', '');
            const dateFormat = settings.dailyNotesDateFormat.includes('/') 
                ? settings.dailyNotesDateFormat.split('/').pop() || settings.dailyNotesDateFormat
                : settings.dailyNotesDateFormat;
            const fileNameDate = moment(basename, dateFormat, true);
            if (fileNameDate.isValid()) {
                this.date = fileNameDate.format('YYYY-MM-DD');
            } else {
                this.date = moment().format('YYYY-MM-DD');
            }
        } else {
            this.date = moment().format('YYYY-MM-DD');
        }
        
        this.description = '';
        this.entries = [
            { account: '', amount: 0, currency: settings.currencies[0] },
            { account: '', amount: 0, currency: settings.currencies[0] }
        ];
        this.isExchange = false;
        this.exchangeAmount = null;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('hledger-modal');

        await this.loadAccounts();

        const dateRow = contentEl.createDiv({ cls: 'hledger-date-row' });

        const typeToggle = dateRow.createEl('select', {
            cls: 'dropdown hledger-type-toggle'
        });

        typeToggle.createEl('option', {
            text: 'Transaction',
            value: 'transaction'
        });
        typeToggle.createEl('option', {
            text: 'Exchange',
            value: 'exchange'
        });

        typeToggle.value = this.isExchange ? 'exchange' : 'transaction';

        const dateInput = dateRow.createEl('input', {
            type: 'date',
            value: this.date,
            cls: 'hledger-date-input'
        });
        dateInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.date = target.value;
        });

        const descriptionInput = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Description',
            value: this.description,
            cls: 'text-input hledger-description-input'
        });
        descriptionInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.description = target.value;
        });
        
        // Set focus on description input when modal opens
        descriptionInput.focus();

        const entriesContainer = contentEl.createDiv('hledger-entries-container');
        this.renderAccountEntries(entriesContainer);

        const buttonsContainer = contentEl.createDiv('hledger-buttons-container');
        
        const leftButtons = buttonsContainer.createDiv('hledger-left-buttons');
        
        const SVG_NS = "http://www.w3.org/2000/svg";

        const svgEl = document.createElementNS(SVG_NS, "svg");
        svgEl.setAttribute("xmlns", SVG_NS);
        svgEl.setAttribute("width", "24");
        svgEl.setAttribute("height", "24");
        svgEl.setAttribute("viewBox", "0 0 24 24");
        svgEl.setAttribute("fill", "none");
        svgEl.setAttribute("stroke", "currentColor");
        svgEl.setAttribute("stroke-width", "2");
        svgEl.setAttribute("stroke-linecap", "round");
        svgEl.setAttribute("stroke-linejoin", "round");
        svgEl.setAttribute("class", "svg-icon lucide-plus");

        const path1 = document.createElementNS(SVG_NS, "path");
        path1.setAttribute("d", "M5 12h14");
        svgEl.appendChild(path1);

        const path2 = document.createElementNS(SVG_NS, "path");
        path2.setAttribute("d", "M12 5v14");
        svgEl.appendChild(path2);
        let addAccountButtonEl: HTMLElement | null = null;
        
        if (!this.isExchange) {        
            const addAccountButton = leftButtons.createEl('button', {
                cls: 'hledger-add-account-button'
            });
            addAccountButton.empty();
            addAccountButton.appendChild(svgEl);
            addAccountButton.addEventListener('click', () => {
                const lastEntry = this.entries[this.entries.length - 1];
                const totalAmount = this.entries.reduce((sum, entry) => sum + entry.amount, 0);
                this.entries.push({
                    account: '',
                    amount: -totalAmount,
                    currency: lastEntry.currency
                });
                this.renderAccountEntries(entriesContainer);
                
                // Focus on the newly added account input
                setTimeout(() => {
                    const newAccountInput = entriesContainer.querySelectorAll('.hledger-account-input');
                    if (newAccountInput && newAccountInput.length > 0) {
                        const lastAccountInput = newAccountInput[newAccountInput.length - 1] as HTMLInputElement;
                        lastAccountInput.focus();
                    }
                }, 10);
            });
            addAccountButtonEl = addAccountButton;
        }

        const submitButton = buttonsContainer.createEl('button', {
            cls: 'mod-cta',
            text: 'Submit'
        });
        submitButton.addEventListener('click', () => {
            const emptyAccounts = this.entries.filter(entry => !entry.account.trim());
            if (emptyAccounts.length > 0) {
                new Notice('Please fill in all account names');
                return;
            }

            const zeroAmounts = this.entries.filter(entry => entry.amount === 0);
            if (zeroAmounts.length > 0) {
                new Notice('Amounts cannot be zero');
                return;
            }

            if (!this.isExchange) {
                const totalAmount = this.entries.reduce((sum, entry) => sum + entry.amount, 0);
                const epsilon = 0.0001; // Small tolerance for floating point comparison
                if (Math.abs(totalAmount) > epsilon) {
                    new Notice(`Transaction does not balance. Total is ${totalAmount.toFixed(2)}`);
                    return;
                }
            }

            this.onSubmit(this.date, this.description, this.entries);
            this.close();
        });

        typeToggle.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            this.isExchange = target.value === 'exchange';
            if (this.isExchange) {
                this.entries = [
                    { account: '', amount: 0, currency: this.settings.currencies[0] },
                    { account: '', amount: 0, currency: this.settings.currencies[1] }
                ];
                if (addAccountButtonEl) {
                    addAccountButtonEl.remove();
                    addAccountButtonEl = null;
                }
            } else {
                this.entries = [
                    { account: '', amount: 0, currency: this.settings.currencies[0] },
                    { account: '', amount: 0, currency: this.settings.currencies[0] }
                ];
                if (!addAccountButtonEl) {
                    const addAccountButton = leftButtons.createEl('button', {
                        cls: 'hledger-add-account-button'
                    });
                    addAccountButton.empty();
                    addAccountButton.appendChild(svgEl);
                    addAccountButton.addEventListener('click', () => {
                        const lastEntry = this.entries[this.entries.length - 1];
                        const totalAmount = this.entries.reduce((sum, entry) => sum + entry.amount, 0);
                        this.entries.push({
                            account: '',
                            amount: -totalAmount,
                            currency: lastEntry.currency
                        });
                        this.renderAccountEntries(entriesContainer);
                        
                        // Focus on the newly added account input
                        setTimeout(() => {
                            const newAccountInput = entriesContainer.querySelectorAll('.hledger-account-input');
                            if (newAccountInput && newAccountInput.length > 0) {
                                const lastAccountInput = newAccountInput[newAccountInput.length - 1] as HTMLInputElement;
                                lastAccountInput.focus();
                            }
                        }, 10);
                    });
                    addAccountButtonEl = addAccountButton;
                }
            }
            this.renderAccountEntries(entriesContainer);
        });
        
        // Add Ctrl+Enter keyboard shortcut to trigger submit button
        contentEl.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                submitButton.click();
            }
        });
    }

    private async loadAccounts() {
        if (!this.settings.accountsFile || !this.settings.hledgerFolder) {
            console.log('No accounts file or Hledger folder specified');
            return;
        }

        try {
            const accountsPath = `${this.settings.hledgerFolder}/${this.settings.accountsFile}`;
            const file = this.app.vault.getAbstractFileByPath(accountsPath);
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                
                this.accounts = content
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.startsWith('account '))
                    .map(line => {
                        const match = line.match(/^account\s+([^;]+)/);
                        return match ? match[1].trim() : null;
                    })
                    .filter((account): account is string => account !== null);
                
            } else {
                console.log('Accounts file not found:', accountsPath);
            }
        } catch (error) {
            console.error('Error loading accounts file:', error);
        }
    }

    private renderAccountEntries(container: HTMLElement) {
        container.empty();
        this.entries.forEach((entry, index) => {
            const entryDiv = container.createDiv('hledger-entry-row');
            
            const accountInputContainer = entryDiv.createDiv('hledger-account-input-container');
            
            const accountInput = accountInputContainer.createEl('input', {
                type: 'text',
                value: entry.account,
                placeholder: 'Account',
                cls: 'text-input hledger-account-input'
            });

            // Create a suggestion container that will be shown/hidden as needed
            const suggestContainer = accountInputContainer.createDiv('hledger-account-suggest-container');
            suggestContainer.style.display = 'none';
            
            // Function to show suggestions based on current input
            const showSuggestions = () => {
                const inputValue = accountInput.value.toLowerCase();
                if (!inputValue) {
                    suggestContainer.style.display = 'none';
                    return;
                }
                
                // Filter accounts using fuzzy matching
                const matches = this.accounts
                    .filter(account => account.toLowerCase().includes(inputValue))
                    .sort((a, b) => {
                        // Prioritize matches at the start of the string
                        const aStartsWithInput = a.toLowerCase().startsWith(inputValue) ? 0 : 1;
                        const bStartsWithInput = b.toLowerCase().startsWith(inputValue) ? 0 : 1;
                        
                        // If one starts with input and other doesn't, prioritize the one that starts with input
                        if (aStartsWithInput !== bStartsWithInput) {
                            return aStartsWithInput - bStartsWithInput;
                        }
                        
                        // If both either start or don't start with input, prioritize by occurrence position
                        const aIndex = a.toLowerCase().indexOf(inputValue);
                        const bIndex = b.toLowerCase().indexOf(inputValue);
                        if (aIndex !== bIndex) {
                            return aIndex - bIndex;
                        }
                        
                        // Otherwise sort by length (shorter first)
                        return a.length - b.length;
                    })
                    .slice(0, 10); // Display up to 10 suggestions
                
                if (matches.length === 0) {
                    suggestContainer.style.display = 'none';
                    return;
                }
                
                // Display matches
                suggestContainer.empty();
                suggestContainer.style.display = 'block';
                
                matches.forEach((account, idx) => {
                    const item = suggestContainer.createDiv({
                        cls: idx === 0 ? 'hledger-account-suggest-item selected' : 'hledger-account-suggest-item'
                    });
                    item.textContent = account;
                    
                    // Handle click on suggestion - works for both mouse and touch
                    item.addEventListener('mousedown', (e) => {
                        e.preventDefault(); // Prevents blur on the input
                        selectSuggestion(account);
                    });
                    
                    // Add touch event for mobile
                    item.addEventListener('touchend', (e) => {
                        e.preventDefault();
                        selectSuggestion(account);
                    });
                    
                    // Handle hover to highlight item (desktop only)
                    item.addEventListener('mouseenter', () => {
                        // Remove selected class from all items
                        suggestContainer.querySelectorAll('.hledger-account-suggest-item').forEach(el => {
                            el.removeClass('selected');
                        });
                        // Add selected class to this item
                        item.addClass('selected');
                    });
                });
            };
            
            // Function to handle suggestion selection
            const selectSuggestion = (account: string) => {
                entry.account = account;
                accountInput.value = account;
                suggestContainer.style.display = 'none';
                
                // Move focus to amount input
                        const amountInput = entryDiv.querySelector('.hledger-amount-input') as HTMLInputElement;
                        if (amountInput) {
                            amountInput.focus();
                        }
            };
            
            // Handle keyboard navigation in suggestions
            accountInput.addEventListener('keydown', (e) => {
                if (suggestContainer.style.display === 'none') {
                    if (e.key === 'ArrowDown') {
                        showSuggestions();
                        e.preventDefault();
                    }
                    return;
                }
                
                const items = suggestContainer.querySelectorAll('.hledger-account-suggest-item');
                const selectedItem = suggestContainer.querySelector('.selected') as HTMLElement;
                let selectedIndex = Array.from(items).indexOf(selectedItem);
                
                switch (e.key) {
                    case 'ArrowDown':
                        if (selectedIndex < items.length - 1) {
                            items[selectedIndex].removeClass('selected');
                            items[selectedIndex + 1].addClass('selected');
                            
                            // Ensure the newly selected item is scrolled into view
                            const nextItem = items[selectedIndex + 1] as HTMLElement;
                            const containerRect = suggestContainer.getBoundingClientRect();
                            const itemRect = nextItem.getBoundingClientRect();
                            
                            // If item is below the visible area
                            if (itemRect.bottom > containerRect.bottom) {
                                suggestContainer.scrollTop += (itemRect.bottom - containerRect.bottom);
                            }
                        }
                        e.preventDefault();
                        break;
                    case 'ArrowUp':
                        if (selectedIndex > 0) {
                            items[selectedIndex].removeClass('selected');
                            items[selectedIndex - 1].addClass('selected');
                            
                            // Ensure the newly selected item is scrolled into view
                            const prevItem = items[selectedIndex - 1] as HTMLElement;
                            const containerRect = suggestContainer.getBoundingClientRect();
                            const itemRect = prevItem.getBoundingClientRect();
                            
                            // If item is above the visible area
                            if (itemRect.top < containerRect.top) {
                                suggestContainer.scrollTop -= (containerRect.top - itemRect.top);
                            }
                        }
                        e.preventDefault();
                        break;
                    case 'Enter':
                        if (selectedItem) {
                            selectSuggestion(selectedItem.textContent || '');
                            e.preventDefault();
                        }
                        break;
                    case 'Escape':
                        suggestContainer.style.display = 'none';
                        e.preventDefault();
                        break;
                }
            });
            
            // Show suggestions as user types
            accountInput.addEventListener('input', showSuggestions);
            
            // Add focus event to show suggestions when focusing on field (for mobile)
            accountInput.addEventListener('focus', showSuggestions);
            
            // Hide suggestions when input loses focus, but with delay to allow click events
            accountInput.addEventListener('blur', (e) => {
                // Don't hide suggestions on mobile when the virtual keyboard is visible
                // This setTimeout gives enough time for interactions to complete
                setTimeout(() => {
                    // Only hide if no element in the container has focus
                    if (!suggestContainer.contains(document.activeElement)) {
                        suggestContainer.style.display = 'none';
                    }
                }, 300);
            });
            
            // Also add mousedown listener to prevent focus loss when clicking suggestions
            suggestContainer.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevents blur on the input
            });
            
            // Prevent touchstart from causing unwanted blur events
            suggestContainer.addEventListener('touchstart', (e) => {
                e.stopPropagation();
            });
            
            // Retain the original click handler for the input
            accountInput.addEventListener('click', () => {
                if (!accountInput.value) {
                    showSuggestions();
                }
            });
            
            accountInput.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                entry.account = target.value;
            });

            const amountInput = entryDiv.createEl('input', {
                type: 'text',
                value: entry.amount ? entry.amount.toString(): '',
                placeholder: 'Amount',
                cls: 'text-input hledger-amount-input'
            });
            amountInput.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                let value = target.value.trim();
                
                // Remove all non-numeric characters except for decimal point, 'k', and 'm'
                // First preserve the suffix if it exists
                let suffix = '';
                if (value.toLowerCase().endsWith('k')) {
                    suffix = 'k';
                    value = value.slice(0, -1);
                } else if (value.toLowerCase().endsWith('m')) {
                    suffix = 'm';
                    value = value.slice(0, -1);
                }
                
                // Remove unwanted characters, keep only digits and decimal point
                value = value.replace(/[^\d.-]/g, '');
                
                // Add the suffix back
                value = value + suffix;
                
                // Handle 'k' and 'm' suffixes for conversion
                if (value.toLowerCase().endsWith('k')) {
                    value = value.slice(0, -1);
                    entry.amount = (parseFloat(value) || 0) * 1000;
                    target.value = entry.amount.toString();
                } else if (value.toLowerCase().endsWith('m')) {
                    value = value.slice(0, -1);
                    entry.amount = (parseFloat(value) || 0) * 1000000;
                    target.value = entry.amount.toString();
                } else {
                    entry.amount = parseFloat(value) || 0;
                    target.value = entry.amount.toString();
                }
                
                // Auto-set opposite amount in second row if there are exactly 2 rows and the second row's amount is empty
                if (index === 0 && this.entries.length === 2) {
                    const secondRow = this.entries[1];
                    const secondAmountInput = container.querySelectorAll('.hledger-amount-input')[1] as HTMLInputElement;
                    
                    if (!secondRow.amount && secondAmountInput && (secondAmountInput.value === '' || secondAmountInput.value === '0')) {
                        // Set opposite amount in second row
                        secondRow.amount = -entry.amount;
                        secondAmountInput.value = secondRow.amount.toString();
                    }
                }
            });

            const currencySelect = entryDiv.createEl('select', {
                cls: 'dropdown hledger-currency-select'
            });
            this.settings.currencies.forEach(currency => {
                const option = currencySelect.createEl('option', {
                    text: currency,
                    value: currency
                });
                if (currency === entry.currency) {
                    option.selected = true;
                }
            });
            currencySelect.addEventListener('change', (e) => {
                const target = e.target as HTMLSelectElement;
                entry.currency = target.value;
            });

            if (this.entries.length > 2 && !this.isExchange) {
                const deleteButton = entryDiv.createEl('button', {
                    cls: 'clickable-icon hledger-delete-button'
                });
                const SVG_NS = "http://www.w3.org/2000/svg";

                const svgEl2 = document.createElementNS(SVG_NS, "svg");
                svgEl2.setAttribute("xmlns", SVG_NS);
                svgEl2.setAttribute("width", "24");
                svgEl2.setAttribute("height", "24");
                svgEl2.setAttribute("viewBox", "0 0 24 24");
                svgEl2.setAttribute("fill", "none");
                svgEl2.setAttribute("stroke", "currentColor");
                svgEl2.setAttribute("stroke-width", "2");
                svgEl2.setAttribute("stroke-linecap", "round");
                svgEl2.setAttribute("stroke-linejoin", "round");
                svgEl2.setAttribute("class", "svg-icon lucide-trash-2");

                const path1 = document.createElementNS(SVG_NS, "path");
                path1.setAttribute("d", "M3 6h18");
                svgEl2.appendChild(path1);

                const path2 = document.createElementNS(SVG_NS, "path");
                path2.setAttribute("d", "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6");
                svgEl2.appendChild(path2);

                const path3 = document.createElementNS(SVG_NS, "path");
                path3.setAttribute("d", "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2");
                svgEl2.appendChild(path3);

                const line1 = document.createElementNS(SVG_NS, "line");
                line1.setAttribute("x1", "10");
                line1.setAttribute("y1", "11");
                line1.setAttribute("x2", "10");
                line1.setAttribute("y2", "17");
                svgEl2.appendChild(line1);

                const line2 = document.createElementNS(SVG_NS, "line");
                line2.setAttribute("x1", "14");
                line2.setAttribute("y1", "11");
                line2.setAttribute("x2", "14");
                line2.setAttribute("y2", "17");
                svgEl2.appendChild(line2);

                deleteButton.empty();
                deleteButton.appendChild(svgEl2);
                deleteButton.addEventListener('click', () => {
                    this.entries.splice(index, 1);
                    this.renderAccountEntries(container);
                });
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
