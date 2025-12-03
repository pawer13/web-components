(async () => {
    // Get the URL of the current script to resolve the HTML file path relative to the script location
    const scriptUrl = import.meta.url || document.currentScript.src;
    const scriptDirectory = scriptUrl.substring(0, scriptUrl.lastIndexOf('/'));
    const htmlUrl = `${scriptDirectory}/combobox.html`;
    const html = await fetch(htmlUrl).then(data => data.text());

class CustomCombobox extends HTMLElement {

    // This declares what attributes can be populated when using this component. The browser
    // will call to our method attributeChangedCallback if one of them is populated
    static get observedAttributes() {
        return ['options', 'value'];
    }

    // This declares that this element can be used within a Form element, so the form can obtain a value from it.
    static get formAssociated() {
        return true;
    }

    // private properties
    #input;
    #dropdown;
    #internals;
    #options;

    constructor() {
        super();

        // Obtains the internals object: needed to work within form elements
        // See https://developer.mozilla.org/en-US/docs/Web/API/ElementInternals
        this.#internals = this.attachInternals();

        // Create a shadow DOM: The internal DOM structure for this element
        this.attachShadow({ mode: 'open' });

        //adding the HTML obtained from the fetch call
        this.#internals.shadowRoot.innerHTML = html;

        // References to the shadow DOM elements
        this.#input = this.#internals.shadowRoot.getElementById('combo-input');
        this.#dropdown = this.#internals.shadowRoot.getElementById('combo-dropdown');
        this.optionsList = this.#internals.shadowRoot.getElementById('combo-options');

        this.#options = this.getOptionsFromChildren();

        this.#input.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDropdown();
        });

    }

    //HTML attributes (for instance, the class attribute in the tag <div class="..."/>) are not directly attributes of this instance, so
    // we need this method to listen to any assignation
    attributeChangedCallback(attributeName, _oldValue, newValue) {
        console.log('Callback called for attribute', attributeName, 'with value', newValue);
        this[attributeName] = newValue;
    }

    get options() {
        return this.#options;
    }

    set options(value) {
        console.log('updating options to', value)
        if (value && typeof value === 'string' || value instanceof String) {
            let array;
            try {
                array = JSON.parse(value);
            } catch {
                return undefined;
            }
            this.#options = array;
        } else if (value instanceof Array) {
            this.#options = value
        }

        // Update the dropdown to reflect the new options
        console.log('Options list element:', this.optionsList);
        console.log('Current options:', this.#options);
        
        if (this.#dropdown && this.optionsList) {
            console.log('Updating dropdown with new options');
            this.updateDropdown(this.#options);
        } else {
            console.log('Dropdown not ready yet');
        }
    }

    /**
     * @param {string} v
     */
    set value(v) {
        console.log('updating value to', v)
        const allOptions = this.getAllFlatOptions();
        const option = allOptions.find(option => option.value === v);
        if (option) {
            this.#input.value = option.label;
        } else {
            this.#input.value = '';
        }
    }

    //our tag behaves similar to a select element, so we need to check any option tag placed inside
    //and also support optgroups for nested options
    getOptionsFromChildren() {
        const options = [];
        
        // Handle direct option elements
        const directOptions = this.querySelectorAll(':scope > option');
        for (const child of directOptions) {
            options.push({ value: child.value, label: child.text });
        }
        
        // Handle optgroup elements with nested options
        const optGroups = this.querySelectorAll('optgroup');
        for (const optGroup of optGroups) {
            const group = {
                label: optGroup.label,
                isGroup: true,
                options: []
            };
            
            const groupOptions = optGroup.querySelectorAll('option');
            for (const option of groupOptions) {
                group.options.push({ value: option.value, label: option.text });
            }
            
            options.push(group);
        }
        
        return options;
    }

    /**
     * Called when the custom element is connected to the document's DOM.
     * Sets up event listeners for input changes, keydown events, and document clicks.
     * Initializes the dropdown with the current options.
     * @override
     */
    connectedCallback() {
        this.#input.addEventListener('input', this.onInputChange);
        this.#input.addEventListener('keydown', this.onInputKeyDown);
        this.#input.addEventListener('blur', this.onInputBlur);
        document.addEventListener('click', this.onDocumentClick);
        this.updateDropdown(this.#options);
    }

    disconnectedCallback() {
        this.#input.removeEventListener('input', this.onInputChange);
        this.#input.removeEventListener('keydown', this.onInputKeyDown);
        this.#input.removeEventListener('blur', this.onInputBlur);
        document.removeEventListener('click', this.onDocumentClick);
    }

    #_onInputChange() {
        const query = this.#input.value;
        if (query) {
            let filteredOptions = this.filterOptions(query);
            
            // Check if we should add an "Add" option
            const hasExactMatch = this.getAllFlatOptions().some(option => 
                option.label.toLowerCase() === query.toLowerCase()
            );
            
            if (!hasExactMatch && query.trim()) {
                filteredOptions.push(`Add "${query}"`);
            }
            
            this.updateDropdown(filteredOptions);
            this.showDropdown();
        } else {
            this.updateDropdown(this.#options);
            this.showDropdown();
        }
    }
    onInputChange=this.#_onInputChange.bind(this);

    #_onInputKeyDown(event) {
        const query = this.#input.value;
        if (event.key === 'Enter') {
            const allOptions = this.getAllFlatOptions();
            const found = allOptions.find(option => option.label === query);
            this.value = found ? found.value : null;
            this.#input.value = found ? found.label : '';
            this.#internals.setFormValue(found ? found.value : null);
            this.hideDropdown();
        } else if (event.key === 'ArrowDown') {
            this.showDropdown();
        }
    }
    onInputKeyDown=this.#_onInputKeyDown.bind(this);

    #_onInputBlur(event) {
        // Use setTimeout to allow click events on dropdown options to process first
        // This prevents the dropdown from closing immediately when clicking on an option
        setTimeout(() => {
            this.hideDropdown();
        }, 150);
    }
    onInputBlur=this.#_onInputBlur.bind(this);

    #_onDocumentClick(event) {
        if (!this.#internals.shadowRoot.contains(event.target) && event.target !== this.#input) {
            this.hideDropdown();
        }
    }
    onDocumentClick=this.#_onDocumentClick.bind(this);

    showDropdown() {
        this.#dropdown.style.display = 'block';
    }

    hideDropdown() {
        this.#dropdown.style.display = 'none';
    }

    updateDropdown(filteredOptions) {
        this.optionsList.innerHTML = '';
        
        filteredOptions.forEach(option => {
            if (option.isGroup) {
                // Create group header
                const groupHeader = document.createElement('li');
                groupHeader.textContent = option.label;
                groupHeader.className = 'group-header';
                this.optionsList.appendChild(groupHeader);
                
                // Create nested options
                option.options.forEach(nestedOption => {
                    const li = document.createElement('li');
                    li.textContent = nestedOption.label;
                    li.className = 'group-option';
                    li.addEventListener('click', () => {
                        this.#input.value = nestedOption.label;
                        this.#internals.setFormValue(nestedOption.value);
                        this.hideDropdown();
                    });
                    this.optionsList.appendChild(li);
                });
            } else {
                // Regular option
                const li = document.createElement('li');
                li.textContent = option.label || option;
                
                // Handle "Add" options (for new entries)
                if (typeof option === 'string' && option.startsWith('Add ')) {
                    li.addEventListener('click', () => {
                        const newValue = option.replace('Add "', '').replace('"', '');
                        const newOption = this.addOption(newValue);
                        this.#input.value = newOption.label;
                        this.#internals.setFormValue(newOption.value);
                        this.hideDropdown();
                    });
                } else {
                    li.addEventListener('click', () => {
                        this.#input.value = option.label || option;
                        this.#internals.setFormValue(option.value || option);
                        this.hideDropdown();
                    });
                }
                
                this.optionsList.appendChild(li);
            }
        });
    }

    filterOptions(query) {
        const lowerCaseQuery = query.toLowerCase();
        const filtered = [];
        
        this.#options.forEach(option => {
            if (option.isGroup) {
                // Filter nested options within the group
                const filteredNestedOptions = option.options.filter(nestedOption =>
                    nestedOption.label.toLowerCase().includes(lowerCaseQuery) ||
                    nestedOption.value.toLowerCase().includes(lowerCaseQuery)
                );
                
                // If any nested options match, include the group with filtered options
                if (filteredNestedOptions.length > 0) {
                    filtered.push({
                        ...option,
                        options: filteredNestedOptions
                    });
                }
            } else {
                // Regular option filtering
                if (option.label.toLowerCase().includes(lowerCaseQuery) ||
                    option.value.toLowerCase().includes(lowerCaseQuery)) {
                    filtered.push(option);
                }
            }
        });
        
        return filtered;
    }

    getAllFlatOptions() {
        const flatOptions = [];
        this.#options.forEach(option => {
            if (option.isGroup) {
                flatOptions.push(...option.options);
            } else {
                flatOptions.push(option);
            }
        });
        return flatOptions;
    }

    addOption(newOption) {
        const elem = { value: newOption, label: newOption }
        this.#options.push(elem);
        console.log(`Added new option: ${newOption}`);
        return elem;
    }
}
customElements.define('combo-box', CustomCombobox);

})();