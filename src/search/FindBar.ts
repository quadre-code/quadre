/*
 * Copyright (c) 2014 - 2017 Adobe Systems Incorporated. All rights reserved.
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
 * UI for the Find/Replace and Find in Files modal bar.
 */

import * as _ from "lodash";
import * as Mustache from "thirdparty/mustache/mustache";
import * as EventDispatcher from "utils/EventDispatcher";
import * as Commands from "command/Commands";
import * as KeyBindingManager from "command/KeyBindingManager";
import * as KeyEvent from "utils/KeyEvent";
import { ModalBar } from "widgets/ModalBar";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as MainViewManager from "view/MainViewManager";
import * as Strings from "strings";
import * as ViewUtils from "utils/ViewUtils";
import * as FindUtils from "search/FindUtils";
import { QuickSearchField } from "search/QuickSearchField";
import * as HealthLogger from "utils/HealthLogger";

/**
 * @private
 * The template we use for all Find bars.
 * @type {string}
 */
import * as _searchBarTemplate from "text!htmlContent/findreplace-bar.html";

interface FindBarOption {
    multifile: boolean;
    replace: boolean;
    queryPlaceholder: string;
    initialQuery: string;
    scopeLabel: string;

    Strings: any;
    replaceBatchLabel: string;
    replaceAllLabel: string;
}

let lastTypedTime = 0;
let currentTime = 0;
let intervalId = 0;
let lastQueriedText = "";
let lastTypedText = "";
let lastTypedTextWasRegexp = false;
// @ts-ignore
let lastKeyCode; // eslint-disable-line @typescript-eslint/no-unused-vars

/**
 * @constructor
 * Find Bar UI component, used for both single- and multi-file find/replace. This doesn't actually
 * create and add the FindBar to the DOM - for that, call open().
 *
 * Dispatches these events:
 *
 * - queryChange - when the user types in the input field or sets a query option. Use getQueryInfo()
 *      to get the current query state.
 * - doFind - when the user chooses to do a Find Previous or Find Next.
 *      Parameters are:
 *          shiftKey - boolean, false for Find Next, true for Find Previous
 * - doReplace - when the user chooses to do a single replace. Use getReplaceText() to get the current replacement text.
 * - doReplaceBatch - when the user chooses to initiate a Replace All. Use getReplaceText() to get the current replacement text.
 * - doReplaceAll - when the user chooses to perform a Replace All. Use getReplaceText() to get the current replacement text.
 * -  close - when the find bar is closed
 *
 * @param {boolean=} options.multifile - true if this is a Find/Replace in Files (changes the behavior of Enter in
 *      the fields, hides the navigator controls, shows the scope/filter controls, and if in replace mode, hides the
 *      Replace button (so there's only Replace All)
 * @param {boolean=} options.replace - true to show the Replace controls - default false
 * @param {string=}  options.queryPlaceholder - label to show in the Find field - default empty string
 * @param {string=}  options.initialQuery - query to populate in the Find field on open - default empty string
 * @param {string=}  scopeLabel - HTML label to show for the scope of the search, expected to be already escaped - default empty string
 */
export class FindBar extends EventDispatcher.EventDispatcherBase {
    private static _bars: Array<FindBar>;

    /*
    * Instance properties/functions
    */

    /**
     * @private
     * Options passed into the FindBar.
     * @type {!{multifile: boolean, replace: boolean, queryPlaceholder: string, initialQuery: string, scopeLabel: string}}
     */
    public _options: FindBarOption;

    /**
     * @private
     * Whether the FindBar has been closed.
     * @type {boolean}
     */
    private _closed = false;

    /**
     * @private
     * Whether the FindBar is currently enabled.
     * @type {boolean}
     */
    private _enabled = true;

    /**
     * @private
     * @type {?ModalBar} Modal bar containing this find bar's UI
     */
    public _modalBar: ModalBar | null;

    private searchField: QuickSearchField;

    constructor(options) {
        super();

        const defaults = {
            multifile: false,
            replace: false,
            queryPlaceholder: "",
            initialQuery: "",
            initialReplaceText: "",
            scopeLabel: ""
        };
        this._options = _.extend(defaults, options);
        this._closed = false;
        this._enabled = true;
    }

    /*
    * Global FindBar functions for making sure only one is open at a time.
    */

    // TODO: this is temporary - we should do this at the ModalBar level, but can't do that until
    // we land the simplified Quick Open UI (#7227) that eliminates some asynchronicity in closing
    // its ModalBar.

    /**
     * @private
     * Register a find bar so we can close it later if another one tries to open.
     * Note that this is a global function, not an instance function.
     * @param {!FindBar} findBar The find bar to register.
     */
    private static _addFindBar(findBar: FindBar) {
        FindBar._bars = FindBar._bars || [];
        FindBar._bars.push(findBar);
    }

    /**
     * @private
     * Remove a find bar from the list.
     * Note that this is a global function, not an instance function.
     * @param {FindBar} findBar The bar to remove.
     */
    private static _removeFindBar(findBar) {
        if (FindBar._bars) {
            _.pull(FindBar._bars, findBar);
        }
    }

    /**
     * @private
     * Close all existing find bars. In theory there should be only one, but since there can be
     * timing issues due to animation we maintain a list.
     * Note that this is a global function, not an instance function.
     */
    private static _closeFindBars() {
        let bars = FindBar._bars;
        if (bars) {
            bars.forEach(function (bar) {
                bar.close(true);
            });
            bars = [];
        }
    }

    /**
     * @private
     * Returns the jQuery object for an element in this Find bar.
     * @param {string} selector The selector for the element.
     * @return {jQueryObject} The jQuery object for the element, or an empty object if the Find bar isn't yet
     *      in the DOM or the element doesn't exist.
     */
    public $(selector) {
        if (this._modalBar) {
            return $(selector, this._modalBar.getRoot());
        }

        return $();
    }

    // TODO: change IDs to classes

    /**
     * @private
     * Set the state of the toggles in the Find bar to the saved prefs state.
     */
    private _updateSearchBarFromPrefs() {
        // Have to make sure we explicitly cast the second parameter to a boolean, because
        // toggleClass expects literal true/false.
        this.$("#find-case-sensitive").toggleClass("active", !!PreferencesManager.getViewState("caseSensitive"));
        this.$("#find-regexp").toggleClass("active", !!PreferencesManager.getViewState("regexp"));
        this.$("#find-whole-word").toggleClass("active", !!PreferencesManager.getViewState("wholeWord"));
    }

    /**
     * @private
     * Save the prefs state based on the state of the toggles.
     */
    private _updatePrefsFromSearchBar() {
        const isRegexp = this.$("#find-regexp").is(".active");
        PreferencesManager.setViewState("caseSensitive", this.$("#find-case-sensitive").is(".active"));
        PreferencesManager.setViewState("regexp", isRegexp);
        PreferencesManager.setViewState("wholeWord", this.$("#find-whole-word").is(".active"));
        lastTypedTextWasRegexp = isRegexp;
    }

    /**
     * @private
     * Shows the keyboard shortcut for the given command in the element's tooltip.
     * @param {jQueryObject} $elem The element to add the shortcut to.
     * @param {string} commandId The ID for the command whose keyboard shortcut to show.
     */
    private _addShortcutToTooltip($elem, commandId) {
        const replaceShortcut = KeyBindingManager.getKeyBindings(commandId)[0];
        if (replaceShortcut) {
            let oldTitle = $elem.attr("title");
            oldTitle = (oldTitle ? oldTitle + " " : "");
            $elem.attr("title", oldTitle + "(" + KeyBindingManager.formatKeyDescriptor(replaceShortcut.displayKey!) + ")");
        }
    }

    /**
     * @private
     * Adds element to the search history queue.
     * @param {string} search string that needs to be added to history.
     */
    private _addElementToSearchHistory(searchVal) {
        if (searchVal) {
            const searchHistory = PreferencesManager.getViewState("searchHistory");
            const maxCount = PreferencesManager.get("maxSearchHistory");
            const searchQueryIndex = searchHistory.indexOf(searchVal);
            if (searchQueryIndex !== -1) {
                searchHistory.splice(searchQueryIndex, 1);
            } else {
                if (searchHistory.length === maxCount) {
                    searchHistory.pop();
                }
            }
            searchHistory.unshift(searchVal);
            PreferencesManager.setViewState("searchHistory", searchHistory);
        }
    }

    /**
     * Opens the Find bar, closing any other existing Find bars.
     */
    public open() {
        const self = this;

        // Normally, creating a new Find bar will simply cause the old one to close
        // automatically. This can cause timing issues because the focus change might
        // cause the new one to think it should close, too. So we simply explicitly
        // close the old Find bar (with no animation) before creating a new one.
        // TODO: see note above - this will move to ModalBar eventually.
        FindBar._closeFindBars();
        if (this._options.multifile) {
            HealthLogger.searchDone(HealthLogger.SEARCH_NEW);
        }

        const templateVars = _.clone(this._options);
        templateVars.Strings = Strings;
        templateVars.replaceBatchLabel = (templateVars.multifile ? Strings.BUTTON_REPLACE_ALL_IN_FILES : Strings.BUTTON_REPLACE_BATCH);
        templateVars.replaceAllLabel = Strings.BUTTON_REPLACE_ALL;

        self._addElementToSearchHistory(this._options.initialQuery);

        this._modalBar = new ModalBar(
            Mustache.render(_searchBarTemplate, templateVars),
            !!PreferencesManager.get("autoHideSearch") // 2nd arg = auto-close on Esc/blur
        );

        // Done this way because ModalBar.js seems to react unreliably when
        // modifying it to handle the escape key - the findbar wasn't getting
        // closed as it should, instead persisting in the background
        function _handleKeydown(e) {
            if (e.keyCode === KeyEvent.DOM_VK_ESCAPE) {
                e.stopPropagation();
                e.preventDefault();
                self.close();
            }
        }
        window.document.body.addEventListener("keydown", _handleKeydown, true);

        // When the ModalBar closes, clean ourselves up.
        this._modalBar.on("close", function (event) {
            window.document.body.removeEventListener("keydown", _handleKeydown, true);

            // Hide error popup, since it hangs down low enough to make the slide-out look awkward
            self.showError(null);
            self._modalBar = null;
            self._closed = true;
            window.clearInterval(intervalId);
            intervalId = 0;
            lastTypedTime = 0;
            FindBar._removeFindBar(self);
            MainViewManager.focusActivePane();
            self.trigger("close");
            if (self.searchField) {
                self.searchField.destroy();
            }
        });

        FindBar._addFindBar(this);

        const $root = this._modalBar.getRoot();

        $root
            .on("input", "#find-what", function () {
                self.trigger("queryChange");
                const queryInfo = self.getQueryInfo();
                lastTypedText = queryInfo.query;
                lastTypedTextWasRegexp = queryInfo.isRegexp;
            })
            .on("click", ".find-toggle", function (e) {
                $(e.currentTarget).toggleClass("active");
                self._updatePrefsFromSearchBar();
                self.trigger("queryChange");
                if (self._options.multifile) {  // instant search
                    self.trigger("doFind");
                }
            })
            .on("click", ".dropdown-icon", function (e) {
                const quickSearchContainer = $(".quick-search-container");
                if (!self.searchField) {
                    self.showSearchHints();
                } else if (quickSearchContainer.is(":visible")) {
                    quickSearchContainer.hide();
                } else {
                    self.searchField.setText(self.$("#find-what").val());
                    quickSearchContainer.show();
                }
                self.$("#find-what").focus();
            })
            .on("keydown", "#find-what, #replace-with", function (e) {
                lastTypedTime = new Date().getTime();
                lastKeyCode = e.keyCode;
                const executeSearchIfNeeded = function () {
                    // We only do instant search via node.
                    if (FindUtils.isNodeSearchDisabled() || FindUtils.isInstantSearchDisabled()) {
                        // we still keep the interval timer up as instant search could get enabled/disabled based on node busy state
                        return;
                    }
                    if (self._closed) {
                        return;
                    }
                    currentTime = new Date().getTime();

                    if (lastTypedTime && (currentTime - lastTypedTime >= 100) &&
                            self.getQueryInfo().query !== lastQueriedText &&
                            !FindUtils.isNodeSearchInProgress()) {

                        // init Search
                        if (self._options.multifile) {
                            if ($(e.target).is("#find-what")) {
                                if (!self._options.replace) {
                                    HealthLogger.searchDone(HealthLogger.SEARCH_INSTANT);
                                    self.trigger("doFind");
                                    lastQueriedText = self.getQueryInfo().query;
                                }
                            }
                        }
                    }
                };
                if (intervalId === 0) {
                    intervalId = window.setInterval(executeSearchIfNeeded, 50);
                }
                if (e.keyCode === KeyEvent.DOM_VK_RETURN) {
                    e.preventDefault();
                    e.stopPropagation();
                    self._addElementToSearchHistory(self.$("#find-what").val());
                    lastQueriedText = self.getQueryInfo().query;
                    if (self._options.multifile) {
                        if ($(e.target).is("#find-what")) {
                            if (self._options.replace) {
                                // Just set focus to the Replace field.
                                self.focusReplace();
                            } else {
                                HealthLogger.searchDone(HealthLogger.SEARCH_ON_RETURN_KEY);
                                // Trigger a Find (which really means "Find All" in this context).
                                self.trigger("doFind");
                            }
                        } else {
                            HealthLogger.searchDone(HealthLogger.SEARCH_REPLACE_ALL);
                            self.trigger("doReplaceBatch");
                        }
                    } else {
                        // In the single file case, we just want to trigger a Find Next (or Find Previous
                        // if Shift is held down).
                        self.trigger("doFind", e.shiftKey);
                    }
                } else if (e.keyCode === KeyEvent.DOM_VK_DOWN || e.keyCode === KeyEvent.DOM_VK_UP) {
                    const quickSearchContainer = $(".quick-search-container");
                    if (!self.searchField) {
                        self.showSearchHints();
                    } else if (!quickSearchContainer.is(":visible")) {
                        quickSearchContainer.show();
                    }
                }
            })
            .on("click", ".close", function () {
                self.close();
            });

        if (!this._options.multifile) {
            this._addShortcutToTooltip($("#find-next"), Commands.CMD_FIND_NEXT);
            this._addShortcutToTooltip($("#find-prev"), Commands.CMD_FIND_PREVIOUS);
            $root
                .on("click", "#find-next", function (e) {
                    self.trigger("doFind", false);
                })
                .on("click", "#find-prev", function (e) {
                    self.trigger("doFind", true);
                });
        }

        if (this._options.replace) {
            this._addShortcutToTooltip($("#replace-yes"), Commands.CMD_REPLACE);
            $root
                .on("click", "#replace-yes", function (e) {
                    self.trigger("doReplace");
                })
                .on("click", "#replace-batch", function (e) {
                    self.trigger("doReplaceBatch");
                })
                .on("click", "#replace-all", function (e) {
                    self.trigger("doReplaceAll");
                })
                // One-off hack to make Find/Replace fields a self-contained tab cycle
                // TODO: remove once https://trello.com/c/lTSJgOS2 implemented
                .on("keydown", function (e) {
                    if (e.keyCode === KeyEvent.DOM_VK_TAB && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        if (e.target.id === "replace-with" && !e.shiftKey) {
                            self.$("#find-what").focus();
                            e.preventDefault();
                        } else if (e.target.id === "find-what" && e.shiftKey) {
                            self.$("#replace-with").focus();
                            e.preventDefault();
                        }
                    }
                });
        }

        if (this._options.multifile && FindUtils.isIndexingInProgress()) {
            this.showIndexingSpinner();
        }

        // Set up the initial UI state.
        this._updateSearchBarFromPrefs();
        this.focusQuery();
    }

    /**
     * @private
     * Shows the search History in dropdown.
     */
    public showSearchHints() {
        const self = this;
        const searchFieldInput = self.$("#find-what");
        this.searchField = new QuickSearchField(searchFieldInput, {
            verticalAdjust: searchFieldInput.offset().top > 0 ? 0 : this._modalBar!.getRoot().outerHeight(),
            maxResults: 20,
            firstHighlightIndex: null,
            resultProvider: function (query) {
                const asyncResult = $.Deferred();
                asyncResult.resolve(PreferencesManager.getViewState("searchHistory"));
                return asyncResult.promise();
            },
            formatter: function (item, query) {
                return "<li>" + item + "</li>";
            },
            onCommit: function (selectedItem, query) {
                if (selectedItem) {
                    self.$("#find-what").val(selectedItem);
                    self.trigger("queryChange");
                } else if (query.length) {
                    self.searchField.setText(query);
                }
                self.$("#find-what").focus();
                $(".quick-search-container").hide();
            },
            onHighlight: function (selectedItem, query, explicit) { /* Do nothing */ },
            highlightZeroResults: false
        });
        this.searchField.setText(searchFieldInput.val());
    }

    /**
     * Closes this Find bar. If already closed, does nothing.
     * @param {boolean} suppressAnimation If true, don't do the standard closing animation. Default false.
     */
    public close(suppressAnimation?) {
        if (this._modalBar) {
            // 1st arg = restore scroll pos; 2nd arg = no animation, since getting replaced immediately
            this._modalBar.close(true, !suppressAnimation);
        }
    }

    /**
     * @return {boolean} true if this FindBar has been closed.
     */
    public isClosed() {
        return this._closed;
    }

    /**
     * @return {Object} The options passed into the FindBar.
     */
    public getOptions() {
        return this._options;
    }

    /**
     * Returns the current query and parameters.
     * @return {{query: string, isCaseSensitive: boolean, isRegexp: boolean, isWholeWord: boolean}}
     */
    public getQueryInfo() {
        return {
            query:           this.$("#find-what").val() || "",
            isCaseSensitive: this.$("#find-case-sensitive").is(".active"),
            isRegexp:        PreferencesManager.getViewState("regexp"),
            isWholeWord:     PreferencesManager.getViewState("wholeWord")
        };
    }

    /**
     * Show or clear an error message related to the query.
     * @param {?string} error The error message to show, or null to hide the error display.
     * @param {boolean=} isHTML Whether the error message is HTML that should remain unescaped.
     */
    public showError(error, isHTML?) {
        const $error = this.$(".error");
        if (error) {
            if (isHTML) {
                $error.html(error);
            } else {
                $error.text(error);
            }
            $error.show();
        } else {
            $error.hide();
        }
    }

    /**
     * Set the find count.
     * @param {string} count The find count message to show. Can be the empty string to hide it.
     */
    public showFindCount(count) {
        this.$("#find-counter").text(count);
    }

    /**
     * Show or hide the no-results indicator and optional message. This is also used to
     * indicate regular expression errors.
     * @param {boolean} showIndicator
     * @param {boolean} showMessage
     */
    public showNoResults(showIndicator, showMessage?) {
        ViewUtils.toggleClass(this.$("#find-what"), "no-results", showIndicator);

        const $msg = this.$(".no-results-message");
        if (showMessage) {
            $msg.show();
        } else {
            $msg.hide();
        }
    }

    /**
     * Returns the current replace text.
     * @return {string}
     */
    public getReplaceText() {
        return this.$("#replace-with").val() || "";
    }

    /**
     * Enables or disables the controls in the Find bar. Note that if enable is true, *all* controls will be
     * re-enabled, even if some were previously disabled using enableNavigation() or enableReplace(), so you
     * will need to refresh their enable state after calling this.
     * @param {boolean} enable Whether to enable or disable the controls.
     */
    public enable(enable) {
        this.$("#find-what, #replace-with, #find-prev, #find-next, .find-toggle").prop("disabled", !enable);
        this._enabled = enable;
    }

    public focus() {
        this.$("#find-what").focus();
    }

    /**
     * @return {boolean} true if the FindBar is enabled.
     */
    public isEnabled() {
        return this._enabled;
    }

    /**
     * @return {boolean} true if the Replace button is enabled.
     */
    public isReplaceEnabled() {
        return this.$("#replace-yes").is(":enabled");
    }

    /**
     * Enable or disable the navigation controls if present. Note that if the Find bar is currently disabled
     * (i.e. isEnabled() returns false), this will have no effect.
     * @param {boolean} enable Whether to enable the controls.
     */
    public enableNavigation(enable) {
        if (this.isEnabled()) {
            this.$("#find-prev, #find-next").prop("disabled", !enable);
        }
    }

    /**
     * Enable or disable the replace controls if present. Note that if the Find bar is currently disabled
     * (i.e. isEnabled() returns false), this will have no effect.
     * @param {boolean} enable Whether to enable the controls.
     */
    public enableReplace(enable) {
        if (this.isEnabled()) {
            this.$("#replace-yes, #replace-batch, #replace-all").prop("disabled", !enable);
        }
    }

    /**
     * @private
     * Focus and select the contents of the given field.
     * @param {string} selector The selector for the field.
     */
    private _focus(selector) {
        const input = this.$(selector)
            .focus()
            .get(0) as HTMLInputElement;
        input.select();
    }

    /**
     * Sets focus to the query field and selects its text.
     */
    public focusQuery() {
        this._focus("#find-what");
    }

    /**
     * Sets focus to the replace field and selects its text.
     */
    public focusReplace() {
        this._focus("#replace-with");
    }

    /**
     * The indexing spinner is usually shown when node is indexing files
     */
    public showIndexingSpinner() {
        this.$("#indexing-spinner").removeClass("forced-hidden");
    }

    public hideIndexingSpinner() {
        this.$("#indexing-spinner").addClass("forced-hidden");
    }

    /**
     * Force a search again
     */
    public redoInstantSearch() {
        this.trigger("doFind");
    }

    /*
    * Returns the string used to prepopulate the find bar
    * @param {!Editor} editor
    * @return {string} first line of primary selection to populate the find bar
    */
    private static _getInitialQueryFromSelection(editor) {
        const selectionText = editor.getSelectedText();
        if (selectionText) {
            return selectionText
                .replace(/^\n*/, "") // Trim possible newlines at the very beginning of the selection
                .split("\n")[0];
        }
        return "";
    }

    /**
     * Gets you the right query and replace text to prepopulate the Find Bar.
     * @static
     * @param {?FindBar} currentFindBar The currently open Find Bar, if any
     * @param {?Editor} The active editor, if any
     * @return {query: string, replaceText: string} Query and Replace text to prepopulate the Find Bar with
     */
    public static getInitialQuery(currentFindBar, editor) {
        let query;
        const selection = editor ? FindBar._getInitialQueryFromSelection(editor) : "";
        let replaceText = "";

        if (currentFindBar && !currentFindBar.isClosed()) {
            // The modalBar was already up. When creating the new modalBar, copy the
            // current query instead of using the passed-in selected text.
            const queryInfo = currentFindBar.getQueryInfo();
            query = (!queryInfo.isRegexp && selection) || queryInfo.query;
            replaceText = currentFindBar.getReplaceText();
        } else {
            const openedFindBar = FindBar._bars && _.find(FindBar._bars,
                function (bar) {
                    return !bar.isClosed();
                }
            );

            if (openedFindBar) {
                query = openedFindBar.getQueryInfo().query;
                replaceText = openedFindBar.getReplaceText();
            } else if (editor) {
                query = (!lastTypedTextWasRegexp && selection) || lastQueriedText || lastTypedText;
            }
        }

        return {query: query, replaceText: replaceText};
    }
}

PreferencesManager.stateManager.definePreference("caseSensitive", "boolean", false);
PreferencesManager.stateManager.definePreference("wholeWord", "boolean", false);
PreferencesManager.stateManager.definePreference("regexp", "boolean", false);
PreferencesManager.stateManager.definePreference("searchHistory", "array", []);
PreferencesManager.definePreference("maxSearchHistory", "number", 10, {
    description: Strings.FIND_HISTORY_MAX_COUNT
});
