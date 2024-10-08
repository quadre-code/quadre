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

import type { SearchMatch } from "search/FindInFiles";

import * as FileUtils from "file/FileUtils";
import * as EventDispatcher from "utils/EventDispatcher";
import * as FindUtils from "search/FindUtils";
import * as MainViewManager from "view/MainViewManager";
import FileSystemEntry = require("filesystem/FileSystemEntry");

interface WorkingSetFileMap {
    [key: string]: boolean;
}

interface CountFilesMatches {
    files: number;
    matches: number;
}

export interface ResultInfo {
    matches: Array<SearchMatch>;
    collapsed?: boolean;
    timestamp: Date | null;
}

/**
 * @constructor
 * Manages a set of search query and result data.
 * Dispatches these events:
 *      "change" - whenever the results have been updated. Note that it's up to people who
 *      edit the model to call fireChange() when necessary - it doesn't automatically fire.
 */
export class SearchModel extends EventDispatcher.EventDispatcherBase {
    /**
     *  @const Constant used to define the maximum results found.
     *  Note that this is a soft limit - we'll likely go slightly over it since
     *  we always add all the searches in a given file.
     */
    public static MAX_TOTAL_RESULTS = 100000;

    /**
     * The current set of results.
     * @type {Object.<fullPath: string, {matches: Array.<Object>, collapsed: boolean, timestamp: Date}>}
     */
    public results: Record<string, ResultInfo>;

    /**
     * The query that generated these results.
     * @type {{query: string, isCaseSensitive: boolean, isRegexp: boolean, isWholeWord: boolean}}
     */
    public queryInfo: FindUtils.QueryInfo | null = null;

    /**
     * The compiled query, expressed as a regexp.
     * @type {RegExp}
     */
    public queryExpr: RegExp | null = null;

    /**
     * Whether this is a find/replace query.
     * @type {boolean}
     */
    public isReplace = false;

    /**
     * The replacement text specified for this query, if any.
     * @type {string}
     */
    public replaceText: string | null = null;

    /**
     * The file/folder path representing the scope that this query was performed in.
     * @type {FileSystemEntry}
     */
    public scope: FileSystemEntry | null = null;

    /**
     * A file filter (as returned from FileFilters) to apply within the main scope.
     * @type {string}
     */
    public filter: string | null = null;

    /**
     * The total number of matches in the model.
     * @type {number}
     */
    public numMatches = 0;

    /**
     * Whether or not we hit the maximum number of results for the type of search we did.
     * @type {boolean}
     */
    public foundMaximum = false;

    /**
     * Whether or not we exceeded the maximum number of results in the search we did.
     * @type {boolean}
     */
    public exceedsMaximum = false;

    public numFiles;
    public allResultsAvailable: boolean;

    constructor() {
        super();

        this.clear();
    }

    /**
     * Clears out the model to an empty state.
     */
    public clear(): void {
        const numMatchesBefore = this.numMatches;
        this.results = {};
        this.queryInfo = null;
        this.queryExpr = null;
        this.isReplace = false;
        this.replaceText = null;
        this.scope = null;
        this.numMatches = 0;
        this.foundMaximum = false;
        this.exceedsMaximum = false;
        if (numMatchesBefore !== 0) {
            this.fireChanged();
        }
    }

    /**
     * Sets the given query info and stores a compiled RegExp query in this.queryExpr.
     * @param {{query: string, isCaseSensitive: boolean, isRegexp: boolean, isWholeWord: boolean}} queryInfo
     * @return {boolean} true if the query was valid and properly set, false if it was
     *      invalid or empty.
     */
    public setQueryInfo(queryInfo: FindUtils.QueryInfo): boolean {
        const parsedQuery = FindUtils.parseQueryInfo(queryInfo);

        if (parsedQuery.valid) {
            this.queryInfo = queryInfo;
            this.queryExpr = parsedQuery.queryExpr!;
            return true;
        }

        return false;
    }

    /**
     * Sets the list of matches for the given path, removing the previous match info, if any, and updating
     * the total match count. Note that for the count to remain accurate, the previous match info must not have
     * been mutated since it was set.
     * @param {string} fullpath Full path to the file containing the matches.
     * @param {!{matches: Object, timestamp: Date, collapsed: boolean=}} resultInfo Info for the matches to set:
     *      matches - Array of matches, in the format returned by FindInFiles._getSearchMatches()
     *      timestamp - The timestamp of the document at the time we searched it.
     *      collapsed - Optional: whether the results should be collapsed in the UI (default false).
     */
    public setResults(fullpath: string, resultInfo: ResultInfo): void {
        this.removeResults(fullpath);

        if (this.foundMaximum || !resultInfo.matches.length) {
            return;
        }

        // Make sure that the optional `collapsed` property is explicitly set to either true or false,
        // to avoid logic issues later with comparing values.
        resultInfo.collapsed = !!resultInfo.collapsed;

        this.results[fullpath] = resultInfo;
        this.numMatches += resultInfo.matches.length;
        if (this.numMatches >= SearchModel.MAX_TOTAL_RESULTS) {
            this.foundMaximum = true;

            // Remove final result if there have been over MAX_TOTAL_RESULTS found
            if (this.numMatches > SearchModel.MAX_TOTAL_RESULTS) {
                this.results[fullpath].matches.pop();
                this.numMatches--;
                this.exceedsMaximum = true;
            }
        }
    }

    /**
     * Removes the given result's matches from the search results and updates the total match count.
     * @param {string} fullpath Full path to the file containing the matches.
     */
    public removeResults(fullpath: string): void {
        if (this.results[fullpath]) {
            this.numMatches -= this.results[fullpath].matches.length;
            delete this.results[fullpath];
        }
    }

    /**
     * @return {boolean} true if there are any results in this model.
     */
    public hasResults(): boolean {
        return Object.keys(this.results).length > 0;
    }

    /**
     * Counts the total number of matches and files
     * @return {{files: number, matches: number}}
     */
    public countFilesMatches(): CountFilesMatches {
        return {files: (this.numFiles || Object.keys(this.results).length), matches: this.numMatches};
    }

    /**
     * Prioritizes the open file and then the working set files to the starting of the list of files
     * If node search is disabled, we sort the files too- Sorting is computation intensive, and our
     * ProjectManager.getAllFiles with the sort flag is not working properly : TODO TOFIX
     * @param {?string} firstFile If specified, the path to the file that should be sorted to the top.
     * @return {Array.<string>}
     */
    public prioritizeOpenFile(firstFile?: string | null): Array<string> {
        const workingSetFiles = MainViewManager.getWorkingSet(MainViewManager.ALL_PANES);
        const workingSetFileFound: WorkingSetFileMap = {};
        const startingWorkingFileSet: Array<string> = [];

        if (FindUtils.isNodeSearchDisabled()) {
            return Object.keys(this.results).sort(function (key1, key2) {
                if (firstFile === key1) {
                    return -1;
                }

                if (firstFile === key2) {
                    return 1;
                }

                return FileUtils.comparePaths(key1, key2);
            });
        }

        firstFile = firstFile || "";

        // Create a working set path map which indicates if a file in working set is found in file list
        for (const workingSetFile of workingSetFiles) {
            workingSetFileFound[workingSetFile.fullPath] = false;
        }

        // Remove all the working set files from the filtration list
        const fileSetWithoutWorkingSet = Object.keys(this.results).filter(function (key) {
            if (workingSetFileFound[key] !== undefined) {
                workingSetFileFound[key] = true;
                return false;
            }
            return true;
        });

        // push in the first file
        if (workingSetFileFound[firstFile] === true) {
            startingWorkingFileSet.push(firstFile);
            workingSetFileFound[firstFile] = false;
        }
        // push in the rest of working set files already present in file list
        for (const propertyName in workingSetFileFound) {
            if (workingSetFileFound.hasOwnProperty(propertyName) && workingSetFileFound[propertyName]) {
                startingWorkingFileSet.push(propertyName);
            }
        }
        return startingWorkingFileSet.concat(fileSetWithoutWorkingSet);
    }

    /**
     * Notifies listeners that the set of results has changed. Must be called after the
     * model is changed.
     * @param {boolean} quickChange Whether this type of change is one that might occur
     *      often, meaning that the view should buffer updates.
     */
    public fireChanged(quickChange?: boolean): void {
        this.trigger("change", quickChange);
    }
}
