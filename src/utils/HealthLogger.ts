/*
 * Copyright (c) 2015 - 2017 Adobe Systems Incorporated. All rights reserved.
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

/**
 *  Utilities functions related to Health Data logging
 */

import * as PreferencesManager from "preferences/PreferencesManager";
import * as LanguageManager from "language/LanguageManager";
import * as FileUtils from "file/FileUtils";
import * as PerfUtils from "utils/PerfUtils";
import * as FindUtils from "search/FindUtils";
import * as StringUtils from "utils/StringUtils";

const HEALTH_DATA_STATE_KEY       = "HealthData.Logs";
let logHealthData                 = true;

/**
 * Init: creates the health log preference keys in the state.json file
 */
export function init() {
    PreferencesManager.stateManager.definePreference(HEALTH_DATA_STATE_KEY, "object", {});
}

/**
 * All the logging functions should be disabled if this returns false
 * @return {boolean} true if health data can be logged
 */
export function shouldLogHealthData() {
    return logHealthData;
}

/**
 * Return all health data logged till now stored in the state prefs
 * @return {Object} Health Data aggregated till now
 */
function getStoredHealthData() {
    const storedData = PreferencesManager.getViewState(HEALTH_DATA_STATE_KEY) || {};
    return storedData;
}

/**
 * Return the aggregate of all health data logged till now from all sources
 * @return {Object} Health Data aggregated till now
 */
export function getAggregatedHealthData() {
    const healthData = getStoredHealthData();
    $.extend(healthData, PerfUtils.getHealthReport());
    $.extend(healthData, FindUtils.getHealthReport());
    return healthData;
}

/**
 * Sets the health data
 * @param {Object} dataObject The object to be stored as health data
 */
function setHealthData(dataObject) {
    if (!shouldLogHealthData()) {
        return;
    }
    PreferencesManager.setViewState(HEALTH_DATA_STATE_KEY, dataObject);
}

/**
 * Returns health data logged for the given key
 * @return {Object} Health Data object for the key or undefined if no health data stored
 */
export function getHealthDataLog(key) {
    const healthData = getStoredHealthData();
    return healthData[key];
}

/**
 * Sets the health data for the given key
 * @param {Object} dataObject The object to be stored as health data for the key
 */
export function setHealthDataLog(key, dataObject) {
    const healthData = getStoredHealthData();
    healthData[key] = dataObject;
    setHealthData(healthData);
}

/**
 * Clears all the health data recorded till now
 */
export function clearHealthData() {
    PreferencesManager.setViewState(HEALTH_DATA_STATE_KEY, {});
    // clear the performance related health data also
    PerfUtils.clear();
}

/**
 * Enable or disable health data logs
 * @param {boolean} enabled true to enable health logs
 */
export function setHealthLogsEnabled(enabled) {
    logHealthData = enabled;
    if (!enabled) {
        clearHealthData();
    }
}

/**
 * Whenever a file is opened call this function. The function will record the number of times
 * the standard file types have been opened. We only log the standard filetypes
 * @param {String} filePath          The path of the file to be registered
 * @param {boolean} addedToWorkingSet set to true if extensions of files added to the
 *                                    working set needs to be logged
 */
export function fileOpened(filePath, addedToWorkingSet) {
    if (!shouldLogHealthData()) {
        return;
    }
    const fileExtension = FileUtils.getFileExtension(filePath);
    const language = LanguageManager.getLanguageForPath(filePath);
    const healthData = getStoredHealthData();
    let fileExtCountMap = {};
    healthData.fileStats = healthData.fileStats || {
        openedFileExt     : {},
        workingSetFileExt : {}
    };
    if (language.getId() !== "unknown") {
        fileExtCountMap = addedToWorkingSet ? healthData.fileStats.workingSetFileExt : healthData.fileStats.openedFileExt;
        if (!fileExtCountMap[fileExtension]) {
            fileExtCountMap[fileExtension] = 0;
        }
        fileExtCountMap[fileExtension]++;
        setHealthData(healthData);
    }
}

/**
 * Sets the project details(a probably unique prjID, number of files in the project and the node cache size) in the health log
 * The name of the project is never saved into the health data log, only the hash(name) is for privacy requirements.
 * @param {string} projectName The name of the project
 * @param {number} numFiles    The number of file in the project
 * @param {number} cacheSize   The node file cache memory consumed by the project
 */
export function setProjectDetail(projectName, numFiles, cacheSize) {
    const projectNameHash = StringUtils.hashCode(projectName);
    let FIFLog = getHealthDataLog("ProjectDetails");
    if (!FIFLog) {
        FIFLog = {};
    }
    FIFLog["prj" + projectNameHash] = {
        numFiles : numFiles,
        cacheSize : cacheSize
    };
    setHealthDataLog("ProjectDetails", FIFLog);
}

/**
 * Increments health log count for a particular kind of search done
 * @param {string} searchType The kind of search type that needs to be logged- should be a js var compatible string
 */
export function searchDone(searchType) {
    let searchDetails = getHealthDataLog("searchDetails");
    if (!searchDetails) {
        searchDetails = {};
    }
    if (!searchDetails[searchType]) {
        searchDetails[searchType] = 0;
    }
    searchDetails[searchType]++;
    setHealthDataLog("searchDetails", searchDetails);
}

// searchType for searchDone()
export const SEARCH_INSTANT            = "searchInstant";
export const SEARCH_ON_RETURN_KEY      = "searchOnReturnKey";
export const SEARCH_REPLACE_ALL        = "searchReplaceAll";
export const SEARCH_NEXT_PAGE          = "searchNextPage";
export const SEARCH_PREV_PAGE          = "searchPrevPage";
export const SEARCH_LAST_PAGE          = "searchLastPage";
export const SEARCH_FIRST_PAGE         = "searchFirstPage";
export const SEARCH_REGEXP             = "searchRegExp";
export const SEARCH_CASE_SENSITIVE     = "searchCaseSensitive";
// A new search context on search bar up-Gives an idea of number of times user did a discrete search
export const SEARCH_NEW                = "searchNew";
