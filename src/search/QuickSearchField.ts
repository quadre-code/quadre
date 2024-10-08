/*
 * Copyright (c) 2013 - 2017 Adobe Systems Incorporated. All rights reserved.
 * Copyright (c) 2018 - present The quadre code authors. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*
 * Text field with attached dropdown list that is updated (based on a provider) whenever the text changes.
 *
 * For styling, the DOM structure of the popup is as follows:
 *  body
 *      ol.quick-search-container
 *          li
 *          li.highlight
 *          li
 * And the text field is:
 *      input
 *      input.no-results
 */

import type { SearchResult } from "utils/StringMatch";

import * as KeyEvent from "utils/KeyEvent";

interface QuickSearchOption {
    resultProvider: (query: string) => SearchResult | JQueryPromise<SearchResult> | Array<SearchResult> | JQueryPromise<Array<SearchResult>> | { error: string | null };
    formatter: (item: string, query: string) => string;
    onCommit: (selectedItem: string | SearchResult | null, query: string) => void;
    onHighlight: (selectedItem: string, query: string, explicit: boolean) => void;
    maxResults?: number;
    verticalAdjust?: number;
    firstHighlightIndex?: number | null;
    highlightZeroResults?: boolean;
}


/**
 * Attaches to an existing <input> tag
 *
 * @constructor
 *
 * @param {!jQueryObject} $input
 * @param {!function(string):($.Promise|Array.<*>|{error:?string}} options.resultProvider
 *          Given the current search text, returns an an array of result objects, an error object, or a
 *          Promise that yields one of those. If the Promise is still outstanding when the query next
 *          changes, resultProvider() will be called again (without waiting for the earlier Promise), and
 *          the Promise's result will be ignored.
 *          If the provider yields [], or a non-null error string, input is decorated with ".no-results"; if
 *          the provider yields a null error string, input is not decorated.
 *
 * @param {!function(*, string):string} options.formatter
 *          Converts one result object to a string of HTML text. Passed the item and the current query. The
 *          outermost element must be <li>. The ".highlight" class can be ignored as it is applied automatically.
 * @param {!function(?*, string):void} options.onCommit
 *          Called when an item is selected by clicking or pressing Enter. Passed the item and the current
 *          query. If the current result list is not up to date with the query text at the time Enter is
 *          pressed, waits until it is before running this callback. If Enter pressed with no results, passed
 *          null. The popup remains open after this event.
 * @param {!function(*, string, boolean):void} options.onHighlight
 *          Called when an item is highlighted in the list. Passed the item, the current query, and a flag that is
 *          true if the item was highlighted explicitly (arrow keys), not simply due to a results list update. Since
 *          the top item in the list is always initially highlighted, every time the list is updated onHighlight()
 *          is called with the top item and with the explicit flag set to false.
 * @param {?number} options.maxResults
 *          Maximum number of items from resultProvider() to display in the popup.
 * @param {?number} options.verticalAdjust
 *          Number of pixels to position the popup below where $input is when constructor is called. Useful
 *          if UI is going to animate position after construction, but QuickSearchField may receive input
 *          before the animation is done.
 * @param {?number} options.firstHighlightIndex
 *          Index of the result that is highlighted by default. null to not highlight any result.
 */
export class QuickSearchField {
    /** @type {!Object} */
    public options: QuickSearchOption;

    /** @type {?$.Promise} Promise corresponding to latest resultProvider call. Any earlier promises ignored */
    private _pending: JQueryPromise<any> | null;

    /** @type {boolean} True if Enter already pressed & just waiting for results to arrive before committing */
    private _commitPending = false;

    /** @type {?string} Value of $input corresponding to the _displayedResults list */
    private _displayedQuery: string | null = null;

    /** @type {?Array.<*>}  Latest resultProvider result */
    private _displayedResults;

    /** @type {?number} */
    private _highlightIndex?;

    /** @type {?jQueryObject} Dropdown's <ol>, while open; null while closed */
    private _$dropdown?;

    /** @type {!jQueryObject} */
    public $input: JQuery;

    private _highlightZeroResults: boolean;
    private _firstHighlightIndex?: number | null;
    private _dropdownTop: number;

    constructor($input, options: QuickSearchOption) {
        this.$input = $input;
        this.options = options;

        options.maxResults = options.maxResults || 10;

        this._handleInput   = this._handleInput.bind(this);
        this._handleKeyDown = this._handleKeyDown.bind(this);

        if (options.highlightZeroResults !== undefined) {
            this._highlightZeroResults = options.highlightZeroResults;
        } else {
            this._highlightZeroResults = true;
        }

        $input.on("input", this._handleInput);
        $input.on("keydown", this._handleKeyDown);

        // For search History this value is set to null
        this._firstHighlightIndex = options.firstHighlightIndex;

        this._dropdownTop = $input.offset().top + $input.height() + (options.verticalAdjust || 0);
    }

    /** When text field changes, update results list */
    private _handleInput(): void {
        this._pending = null;  // immediately invalidate any previous Promise

        const valueAtEvent = this.$input.val();
        const self = this;
        // The timeout lets us skip over a backlog of multiple keyboard events when the provider is responding
        // so slowly that JS execution can't keep up. All the remaining input events are serviced before the
        // first timeout runs; then all the queued-up timeouts run in a row. All except the last one can no-op.
        setTimeout(function () {
            if (self.$input.val() === valueAtEvent) {
                self.updateResults();
            }
        }, 0);
    }

    /** Handle special keys: Enter, Up/Down */
    private _handleKeyDown(event): void {
        if (event.keyCode === KeyEvent.DOM_VK_RETURN) {
            // Enter should always act on the latest results. If input has changed and we're still waiting for
            // new results, just flag the 'commit' for later
            if (this._displayedQuery === this.$input.val()) {
                event.preventDefault();  // prevents keyup from going to someone else after we close
                this._doCommit();
            } else {
                // Once the current wait resolves, _render() will run the commit
                this._commitPending = true;
            }
        } else if (event.keyCode === KeyEvent.DOM_VK_DOWN) {
            // Highlight changes are always done synchronously on the currently shown result list. If the list
            // later changes, the highlight is reset to the top
            if (this._displayedResults && this._displayedResults.length) {
                if (this._highlightIndex === null || this._highlightIndex === this._displayedResults.length - 1) {
                    this._highlightIndex = 0;
                } else {
                    this._highlightIndex++;
                }
                this._updateHighlight(true);
            }
            event.preventDefault(); // treated as Home key otherwise

        } else if (event.keyCode === KeyEvent.DOM_VK_UP) {
            if (this._displayedResults && this._displayedResults.length) {
                if (this._highlightIndex === null || this._highlightIndex === 0) {
                    this._highlightIndex = this._displayedResults.length - 1;
                } else {
                    this._highlightIndex--;
                }
                this._updateHighlight(true);
            }
            event.preventDefault(); // treated as End key otherwise
        }
    }

    /** Call onCommit() immediately */
    private _doCommit(index?: number): void {
        let item;
        if (this._displayedResults && this._displayedResults.length) {
            if (index! >= 0) {
                item = this._displayedResults[index!];
            } else if (this._highlightIndex >= 0) {
                item = this._displayedResults[this._highlightIndex];
            }
        }
        this.options.onCommit(item, this._displayedQuery!);
    }

    /** Update display to reflect value of _highlightIndex, & call onHighlight() */
    private _updateHighlight(explicit): void {
        if (this._$dropdown) {
            const $items = this._$dropdown.find("li");
            $items.removeClass("highlight");
            if (this._highlightIndex !== null) {
                $items.eq(this._highlightIndex).addClass("highlight");

                this.options.onHighlight(this._displayedResults[this._highlightIndex], this.$input.val(), explicit);
            }
        }
    }

    /**
     * Refresh the results dropdown, as if the user had changed the search text. Useful for providers that
     * want to show cached data initially, then update the results with fresher data once available.
     */
    public updateResults(): void {
        this._pending = null;  // immediately invalidate any previous Promise

        const query = this.$input.val();
        const results = this.options.resultProvider(query);
        if ((results as any).done && (results as any).fail) {
            // Provider returned an async result - mark it as the latest Promise and if it's still latest when
            // it resolves, render the results then
            this._pending = results as JQueryPromise<any>;
            const self = this;
            this._pending!.done(function (realResults) {
                if (self._pending === results) {
                    self._render(realResults, query);
                    self._pending = null;
                }
            });
            if (this._pending) {
                this._pending.fail(function () {
                    if (self._pending === results) {
                        self._render([], query);
                        self._pending = null;
                    }
                });
            }
        } else {
            // Synchronous result - render immediately
            this._render(results, query);
        }
    }


    /** Close dropdown result list if visible */
    private _closeDropdown(): void {
        if (this._$dropdown) {
            this._$dropdown.remove();
            this._$dropdown = null;
        }
    }

    /**
     * Open dropdown result list & populate with the given content
     * @param {!string} htmlContent
     */
    private _openDropdown(htmlContent: string): void {
        if (!this._$dropdown) {
            const self = this;
            this._$dropdown = $("<ol class='quick-search-container'/>").appendTo("body")
                .css({
                    position: "absolute",
                    top: this._dropdownTop,
                    left: this.$input.offset().left,
                    width: this.$input.outerWidth()
                })
                .click(function (event) {
                    // Unlike the Enter key, where we wait to catch up with typing, clicking commits immediately
                    const $item = $(event.target).closest("li");
                    if ($item.length) {
                        self._doCommit($item.index());
                    }
                });
        }
        this._$dropdown.html(htmlContent);
    }

    /**
     * Given finished provider result, format it into HTML and show in dropdown, and update "no-results" style.
     * If an Enter key commit was pending from earlier, process it now.
     * @param {!Array.<*>} results
     * @param {!string} query
     */
    private _render(results, query: string): void {
        this._displayedQuery = query;
        this._displayedResults = results;
        if (this._firstHighlightIndex! >= 0) {
            this._highlightIndex = this._firstHighlightIndex;
        } else {
            this._highlightIndex = null;
        }
        // TODO: fixup to match prev value's item if possible?

        if (results.error || results.length === 0) {
            this._closeDropdown();
            if (this._highlightZeroResults) {
                this.$input.addClass("no-results");
            }
        } else if (results.hasOwnProperty("error")) {
            // Error present but falsy - no results to show, but don't decorate with error style
            this._closeDropdown();
            if (this._highlightZeroResults) {
                this.$input.removeClass("no-results");
            }
        } else {
            if (this._highlightZeroResults) {
                this.$input.removeClass("no-results");
            }

            const count = Math.min(results.length, this.options.maxResults!);
            let html = "";
            for (let i = 0; i < count; i++) {
                html += this.options.formatter(results[i], query);
            }
            this._openDropdown(html);

            // Highlight top item and trigger highlight callback
            this._updateHighlight(false);
        }

        // If Enter key was pressed earlier, handle it now that we've gotten results back
        if (this._commitPending) {
            this._commitPending = false;
            this._doCommit();
        }
    }


    /**
     * Programmatically changes the search text and updates the results.
     * @param {!string} value
     */
    public setText(value: string): void {
        this.$input.val(value);
        this.updateResults();  // programmatic changes don't trigger "input" event
    }

    /**
     * Closes the dropdown, and discards any pending Promises.
     */
    public destroy(): void {
        this._pending = null;  // immediately invalidate any pending Promise
        this._closeDropdown();
    }
}
