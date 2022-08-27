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
 * Panel showing search results for a Find/Replace in Files operation.
 */

import * as CommandManager from "command/CommandManager";
import * as EventDispatcher from "utils/EventDispatcher";
import * as Commands from "command/Commands";
import * as DocumentManager from "document/DocumentManager";
import * as EditorManager from "editor/EditorManager";
import * as ProjectManager from "project/ProjectManager";
import * as FileViewController from "project/FileViewController";
import * as FileUtils from "file/FileUtils";
import * as FindUtils from "search/FindUtils";
import * as WorkspaceManager from "view/WorkspaceManager";
import * as StringUtils from "utils/StringUtils";
import * as Strings from "strings";
import * as HealthLogger from "utils/HealthLogger";
import * as _ from "lodash";
import * as Mustache from "thirdparty/mustache/mustache";

import * as searchPanelTemplate from "text!htmlContent/search-panel.html";
import * as searchResultsTemplate from "text!htmlContent/search-results.html";
import * as searchSummaryTemplate from "text!htmlContent/search-summary.html";

interface SearchItem {
    fileIndex: number;
    filename: string;
    fullPath: string;
    isChecked: boolean;
    items: Array<any>;
    // TODO: verify types, collapsed is correct here?
    collapsed?: boolean;
    isCollapsed: boolean;
}

/**
 * @const
 * The maximum results to show per page.
 * @type {number}
 */
const RESULTS_PER_PAGE = 100;

/**
 * @const
 * Debounce time for document changes updating the search results view.
 * @type {number}
 */
const UPDATE_TIMEOUT   = 400;

export class SearchResultsView extends EventDispatcher.EventDispatcherBase {

    /** @type {SearchModel} The search results model we're viewing. */
    private _model;

    /**
     * Array with content used in the Results Panel
     * @type {Array.<{fileIndex: number, filename: string, fullPath: string, items: Array.<Object>}>}
     */
    private _searchList: Array<SearchItem> = [];

    /** @type {Panel} Bottom panel holding the search results */
    private _panel;

    /** @type {?string} The full path of the file that was open in the main editor on the initial search */
    private _initialFilePath: string | null = null;

    /** @type {number} The index of the first result that is displayed */
    private _currentStart = 0;

    /** @type {boolean} Used to remake the replace all summary after it is changed */
    private _allChecked = false;

    /** @type {$.Element} The currently selected row */
    private _$selectedRow: JQuery | null;

    /** @type {$.Element} The element where the title is placed */
    private _$summary;

    /** @type {$.Element} The table that holds the results */
    private _$table: JQuery;

    /** @type {number} The ID we use for timeouts when handling model changes. */
    private _timeoutID;

    /** @type {string} The Id we use to check if it is reference search or match search */
    private _searchResultsType = null;

    /**
     * @constructor
     * Handles the search results panel.
     * Dispatches the following events:
     *      replaceBatch - when the "Replace" button is clicked.
     *      close - when the panel is closed.
     *
     * @param {SearchModel} model The model that this view is showing.
     * @param {string} panelID The CSS ID to use for the panel.
     * @param {string} panelName The name to use for the panel, as passed to WorkspaceManager.createBottomPanel().
     * @param {string} type type to identify if it is reference search or string match serach
     */
    constructor(model, panelID, panelName, type?) {
        super();

        const panelHtml  = Mustache.render(searchPanelTemplate, {panelID: panelID});

        this._panel    = WorkspaceManager.createBottomPanel(panelName, $(panelHtml), 100);
        this._$summary = this._panel.$panel.find(".title");
        this._$table   = this._panel.$panel.find(".table-container");
        this._model    = model;
        this._searchResultsType = type;
    }

    /**
     * @private
     * Handles when model changes. Updates the view, buffering changes if necessary so as not to churn too much.
     */
    private _handleModelChange(quickChange) {
        // If this is a replace, to avoid complications with updating, just close ourselves if we hear about
        // a results model change after we've already shown the results initially.
        // TODO: notify user, re-do search in file
        if (this._model.isReplace) {
            this.close();
            return;
        }

        const self = this;
        if (this._timeoutID) {
            window.clearTimeout(this._timeoutID);
        }
        if (quickChange) {
            this._timeoutID = window.setTimeout(function () {
                self._updateResults();
                self._timeoutID = null;
            }, UPDATE_TIMEOUT);
        } else {
            this._updateResults();
        }
    }

    /**
     * @private
     * Adds the listeners for close, prev, next, first, last and check all
     */
    private _addPanelListeners() {
        const self = this;
        this._panel.$panel
            .off(".searchResults")  // Remove the old events
            .on("dblclick.searchResults", ".toolbar", function () {
                self.close();
            })
            .on("click.searchResults", ".close", function () {
                self.close();
            })
            // The link to go the first page
            .on("click.searchResults", ".first-page:not(.disabled)", function () {
                self._currentStart = 0;
                self._render();
                HealthLogger.searchDone(HealthLogger.SEARCH_FIRST_PAGE);
            })
            // The link to go the previous page
            .on("click.searchResults", ".prev-page:not(.disabled)", function () {
                self._currentStart -= RESULTS_PER_PAGE;
                self._render();
                HealthLogger.searchDone(HealthLogger.SEARCH_PREV_PAGE);
            })
            // The link to go to the next page
            .on("click.searchResults", ".next-page:not(.disabled)", function () {
                self.trigger("getNextPage");
                HealthLogger.searchDone(HealthLogger.SEARCH_NEXT_PAGE);
            })
            // The link to go to the last page
            .on("click.searchResults", ".last-page:not(.disabled)", function () {
                self.trigger("getLastPage");
                HealthLogger.searchDone(HealthLogger.SEARCH_LAST_PAGE);
            })

            // Add the file to the working set on double click
            .on("dblclick.searchResults", ".table-container tr:not(.file-section)", function (this: any, e) {
                const item = self._searchList[$(this).data("file-index")];
                FileViewController.openFileAndAddToWorkingSet(item.fullPath);
            })

            // Add the click event listener directly on the table parent
            .on("click.searchResults .table-container", function (e) {
                const $row = $(e.target).closest("tr");

                if ($row.length) {
                    if (self._$selectedRow) {
                        self._$selectedRow.removeClass("selected");
                    }
                    $row.addClass("selected");
                    self._$selectedRow = $row;

                    let searchItem = self._searchList[$row.data("file-index")];
                    let fullPath   = searchItem.fullPath;

                    // This is a file title row, expand/collapse on click
                    if ($row.hasClass("file-section")) {
                        let $titleRows;
                        const collapsed = !self._model.results[fullPath].collapsed;

                        if (e.metaKey || e.ctrlKey) { // Expand all / Collapse all
                            $titleRows = $(e.target).closest("table").find(".file-section");
                        } else {
                            // Clicking the file section header collapses/expands result rows for that file
                            $titleRows = $row;
                        }

                        $titleRows.each(function (this: any) {
                            fullPath   = self._searchList[$(this).data("file-index")].fullPath;
                            searchItem = self._model.results[fullPath];

                            if (searchItem.collapsed !== collapsed) {
                                searchItem.collapsed = collapsed;
                                $(this).nextUntil(".file-section").toggle();
                                $(this).find(".disclosure-triangle").toggleClass("expanded");
                            }
                        });

                        // In Expand/Collapse all, reset all search results 'collapsed' flag to same value(true/false).
                        if (e.metaKey || e.ctrlKey) {
                            FindUtils.setCollapseResults(collapsed);
                            _.forEach(self._model.results, function (item) {
                                item.collapsed = collapsed;
                            });
                        }

                    // This is a file row, show the result on click
                    } else {
                        // Grab the required item data
                        const item = searchItem.items[$row.data("item-index")];

                        CommandManager.execute(Commands.FILE_OPEN, {fullPath: fullPath})
                            .done(function (doc) {
                                // Opened document is now the current main editor
                                EditorManager.getCurrentFullEditor().setSelection(item.start, item.end, true);
                            });
                    }
                }
            });

        function updateHeaderCheckbox($checkAll) {
            const $allFileRows     = self._panel.$panel.find(".file-section");
            const $checkedFileRows = $allFileRows.filter(function (this: any, index) {
                return $(this).find(".check-one-file").is(":checked");
            });
            if ($checkedFileRows.length === $allFileRows.length) {
                $checkAll.prop("checked", true);
            }
        }

        function updateFileAndHeaderCheckboxes($clickedRow, isChecked) {
            const $firstMatch = ($clickedRow.data("item-index") === 0)
                ? $clickedRow
                : $clickedRow.prevUntil(".file-section").last();
            const $fileRow = $firstMatch.prev();
            const $siblingRows = $fileRow.nextUntil(".file-section");
            const $fileCheckbox = $fileRow.find(".check-one-file");
            const $checkAll = self._panel.$panel.find(".check-all");

            if (isChecked) {
                if (!$fileCheckbox.is(":checked")) {
                    const $checkedSibilings = $siblingRows.filter(function (this: any, index) {
                        return $(this).find(".check-one").is(":checked");
                    });
                    if ($checkedSibilings.length === $siblingRows.length) {
                        $fileCheckbox.prop("checked", true);
                        if (!$checkAll.is(":checked")) {
                            updateHeaderCheckbox($checkAll);
                        }
                    }
                }
            } else {
                if ($checkAll.is(":checked")) {
                    $checkAll.prop("checked", false);
                }
                if ($fileCheckbox.is(":checked")) {
                    $fileCheckbox.prop("checked", false);
                }
            }
        }

        // Add the Click handlers for replace functionality if required
        if (this._model.isReplace) {
            this._panel.$panel
                .on("click.searchResults", ".check-all", function (this: any, e) {
                    const isChecked = $(this).is(":checked");
                    _.forEach(self._model.results, function (results) {
                        results.matches.forEach(function (match) {
                            match.isChecked = isChecked;
                        });
                    });
                    self._$table.find(".check-one").prop("checked", isChecked);
                    self._$table.find(".check-one-file").prop("checked", isChecked);
                    self._allChecked = isChecked;
                })
                .on("click.searchResults", ".check-one-file", function (this: any, e) {
                    const isChecked = $(this).is(":checked");
                    const $row = $(e.target).closest("tr");
                    const item = self._searchList[$row.data("file-index")];
                    const $matchRows = $row.nextUntil(".file-section");
                    const $checkAll = self._panel.$panel.find(".check-all");

                    if (item) {
                        self._model.results[item.fullPath].matches.forEach(function (match) {
                            match.isChecked = isChecked;
                        });
                    }
                    $matchRows.find(".check-one").prop("checked", isChecked);
                    if (!isChecked) {
                        if ($checkAll.is(":checked")) {
                            $checkAll.prop("checked", false);
                        }
                    } else if (!$checkAll.is(":checked")) {
                        updateHeaderCheckbox($checkAll);
                    }
                    e.stopPropagation();
                })
                .on("click.searchResults", ".check-one", function (this: any, e) {
                    const $row = $(e.target).closest("tr");
                    const item = self._searchList[$row.data("file-index")];
                    const match = self._model.results[item.fullPath].matches[$row.data("match-index")];

                    match.isChecked = $(this).is(":checked");
                    updateFileAndHeaderCheckboxes($row, match.isChecked);
                    e.stopPropagation();
                })
                .on("click.searchResults", ".replace-checked", function (e) {
                    self.trigger("replaceBatch");
                });
        }
    }


    /**
     * @private
     * Shows the Results Summary
     */
    private _showSummary() {
        const count     = this._model.countFilesMatches();
        const lastIndex = this._getLastIndex(count.matches);
        let typeStr = (count.matches > 1) ? Strings.FIND_IN_FILES_MATCHES : Strings.FIND_IN_FILES_MATCH;

        if (this._searchResultsType === "reference") {
            typeStr = (count.matches > 1) ? Strings.REFERENCES_IN_FILES : Strings.REFERENCE_IN_FILES;
        }

        const filesStr = StringUtils.format(
            Strings.FIND_NUM_FILES,
            count.files,
            (count.files > 1 ? Strings.FIND_IN_FILES_FILES : Strings.FIND_IN_FILES_FILE)
        );

        // This text contains some formatting, so all the strings are assumed to be already escaped
        const summary = StringUtils.format(
            Strings.FIND_TITLE_SUMMARY,
            this._model.exceedsMaximum ? Strings.FIND_IN_FILES_MORE_THAN : "",
            String(count.matches),
            typeStr,
            filesStr
        );

        this._$summary.html(Mustache.render(searchSummaryTemplate, {
            query:       (this._model.queryInfo && this._model.queryInfo.query && this._model.queryInfo.query.toString()) || "",
            replaceWith: this._model.replaceText,
            titleLabel:  this._model.isReplace ? Strings.FIND_REPLACE_TITLE_LABEL : Strings.FIND_TITLE_LABEL,
            scope:       this._model.scope ? "&nbsp;" + FindUtils.labelForScope(this._model.scope) + "&nbsp;" : "",
            summary:     summary,
            allChecked:  this._allChecked,
            hasPages:    count.matches > RESULTS_PER_PAGE,
            results:     StringUtils.format(Strings.FIND_IN_FILES_PAGING, this._currentStart + 1, lastIndex),
            hasPrev:     this._currentStart > 0,
            hasNext:     lastIndex < count.matches,
            replace:     this._model.isReplace,
            Strings:     Strings
        }));
    }

    /**
     * @private
     * Shows the current set of results.
     */
    private _render() {
        let searchItems;
        let match;
        let i;
        let item;
        let multiLine;
        const count            = this._model.countFilesMatches();
        const searchFiles      = this._model.prioritizeOpenFile(this._initialFilePath);
        const lastIndex        = this._getLastIndex(count.matches);
        let matchesCounter   = 0;
        let showMatches      = false;
        let allInFileChecked = true;
        const self             = this;

        this._showSummary();
        this._searchList = [];

        // Iterates throuh the files to display the results sorted by filenamess. The loop ends as soon as
        // we filled the results for one page
        searchFiles.some(function (fullPath) {
            showMatches = true;
            item = self._model.results[fullPath];

            // Since the amount of matches on this item plus the amount of matches we skipped until
            // now is still smaller than the first match that we want to display, skip these.
            if (matchesCounter + item.matches.length < self._currentStart) {
                matchesCounter += item.matches.length;
                showMatches = false;

            // If we still haven't skipped enough items to get to the first match, but adding the
            // item matches to the skipped ones is greater the the first match we want to display,
            // then we can display the matches from this item skipping the first ones
            } else if (matchesCounter < self._currentStart) {
                i = self._currentStart - matchesCounter;
                matchesCounter = self._currentStart;

            // If we already skipped enough matches to get to the first match to display, we can start
            // displaying from the first match of this item
            } else if (matchesCounter < lastIndex) {
                i = 0;

            // We can't display more items by now. Break the loop
            } else {
                return true;
            }

            if (showMatches && i < item.matches.length) {
                // Add a row for each match in the file
                searchItems = [];

                allInFileChecked = true;
                // Add matches until we get to the last match of this item, or filling the page
                while (i < item.matches.length && matchesCounter < lastIndex) {
                    match     = item.matches[i];
                    multiLine = match.start.line !== match.end.line;

                    searchItems.push({
                        fileIndex:   self._searchList.length,
                        itemIndex:   searchItems.length,
                        matchIndex:  i,
                        line:        match.start.line + 1,
                        pre:         match.line.substr(0, match.start.ch - match.highlightOffset),
                        highlight:   match.line.substring(match.start.ch - match.highlightOffset, multiLine ? undefined : match.end.ch - match.highlightOffset),
                        post:        multiLine ? "\u2026" : match.line.substr(match.end.ch - match.highlightOffset),
                        start:       match.start,
                        end:         match.end,
                        isChecked:   match.isChecked,
                        isCollapsed: item.collapsed
                    });
                    if (!match.isChecked) {
                        allInFileChecked = false;
                    }
                    matchesCounter++;
                    i++;
                }

                // Add a row for each file
                const relativePath    = FileUtils.getDirectoryPath(ProjectManager.makeProjectRelativeIfPossible(fullPath));
                const directoryPath   = FileUtils.getDirectoryPath(relativePath);
                const displayFileName = StringUtils.format(
                    Strings.FIND_IN_FILES_FILE_PATH,
                    StringUtils.breakableUrl(FileUtils.getBaseName(fullPath)),
                    StringUtils.breakableUrl(directoryPath),
                    directoryPath ? "&mdash;" : ""
                );

                self._searchList.push({
                    fileIndex:   self._searchList.length,
                    filename:    displayFileName,
                    fullPath:    fullPath,
                    isChecked:   allInFileChecked,
                    items:       searchItems,
                    isCollapsed: item.collapsed
                });
            }

            return undefined;
        });


        // Insert the search results
        this._$table
            .empty()
            .append(Mustache.render(searchResultsTemplate, {
                replace:       this._model.isReplace,
                searchList:    this._searchList,
                Strings:       Strings
            }));

        if (this._$selectedRow) {
            this._$selectedRow.removeClass("selected");
            this._$selectedRow = null;
        }

        this._panel.show();
        this._$table.scrollTop(0); // Otherwise scroll pos from previous contents is remembered
    }

    /**
     * Updates the results view after a model change, preserving scroll position and selection.
     */
    private _updateResults() {
        // In general this shouldn't get called if the panel is closed, but in case some
        // asynchronous process kicks this (e.g. a debounced model change), we double-check.
        if (this._panel.isVisible()) {
            const scrollTop  = this._$table.scrollTop();
            const index      = this._$selectedRow ? this._$selectedRow.index() : null;
            const numMatches = this._model.countFilesMatches().matches;

            if (this._currentStart > numMatches) {
                this._currentStart = this._getLastCurrentStart(numMatches);
            }

            this._render();

            this._$table.scrollTop(scrollTop);
            if (index) {
                this._$selectedRow = this._$table.find("tr:eq(" + index + ")");
                this._$selectedRow.addClass("selected");
            }
        }
    }

    /**
     * @private
     * Returns one past the last result index displayed for the current page.
     * @param {number} numMatches
     * @return {number}
     */
    private _getLastIndex(numMatches) {
        return Math.min(this._currentStart + RESULTS_PER_PAGE, numMatches);
    }

    /**
     * Shows the next page of the resultrs view if possible
     */
    public showNextPage() {
        this._currentStart += RESULTS_PER_PAGE;
        this._render();
    }

    /**
     * Shows the last page of the results view.
     */
    public showLastPage() {
        this._currentStart = this._getLastCurrentStart();
        this._render();
    }

    /**
     * @private
     * Returns the last possible current start based on the given number of matches
     * @param {number=} numMatches
     * @return {number}
     */
    private _getLastCurrentStart(numMatches?) {
        numMatches = numMatches || this._model.countFilesMatches().matches;
        return Math.floor((numMatches - 1) / RESULTS_PER_PAGE) * RESULTS_PER_PAGE;
    }

    /**
     * Opens the results panel and displays the current set of results from the model.
     */
    public open() {
        // Clear out any paging/selection state.
        this._currentStart  = 0;
        this._$selectedRow  = null;
        this._allChecked    = true;

        // Save the currently open document's fullpath, if any, so we can sort it to the top of the result list.
        const currentDoc = DocumentManager.getCurrentDocument();
        this._initialFilePath = currentDoc ? currentDoc.file.fullPath : null;

        this._render();

        // Listen for user interaction events with the panel and change events from the model.
        this._addPanelListeners();
        this._model.on("change.SearchResultsView", this._handleModelChange.bind(this));
    }

    /**
     * Hides the Search Results Panel and unregisters listeners.
     */
    public close() {
        if (this._panel && this._panel.isVisible()) {
            this._$table.empty();
            this._panel.hide();
            this._panel.$panel.off(".searchResults");
            this._model.off("change.SearchResultsView");
            this.trigger("close");
        }
    }
}
