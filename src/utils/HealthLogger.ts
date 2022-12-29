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

import type { Document } from "document/DocumentManager";
import type File = require("filesystem/File");

import * as PreferencesManager from "preferences/PreferencesManager";
import * as LanguageManager from "language/LanguageManager";
import * as FileUtils from "file/FileUtils";
import * as PerfUtils from "utils/PerfUtils";
import * as FindUtils from "search/FindUtils";
import * as StringUtils from "utils/StringUtils";
import * as EventDispatcher from "utils/EventDispatcher";

const HEALTH_DATA_STATE_KEY       = "HealthData.Logs";
let logHealthData                 = true;
export const analyticsEventMap    = new Map();

export const commonStrings = {
    USAGE: "usage",
    FILE_OPEN: "fileOpen",
    FILE_NEW: "newfile",
    FILE_SAVE: "fileSave",
    FILE_CLOSE: "fileClose",
    LANGUAGE_CHANGE: "languageChange",
    LANGUAGE_SERVER_PROTOCOL: "languageServerProtocol",
    CODE_HINTS: "codeHints",
    PARAM_HINTS: "parameterHints",
    JUMP_TO_DEF: "jumpToDefinition"
};

EventDispatcher.makeEventDispatcher(exports);

/**
 * Init: creates the health log preference keys in the state.json file
 */
export function init(): void {
    PreferencesManager.stateManager.definePreference(HEALTH_DATA_STATE_KEY, "object", {});
}

/**
 * All the logging functions should be disabled if this returns false
 * @return {boolean} true if health data can be logged
 */
export function shouldLogHealthData(): boolean {
    return logHealthData;
}

/**
 * Return all health data logged till now stored in the state prefs
 * @return {Object} Health Data aggregated till now
 */
function getStoredHealthData(): any {
    const storedData = PreferencesManager.getViewState(HEALTH_DATA_STATE_KEY) || {};
    return storedData;
}

/**
 * Return the aggregate of all health data logged till now from all sources
 * @return {Object} Health Data aggregated till now
 */
export function getAggregatedHealthData(): any {
    const healthData = getStoredHealthData();
    $.extend(healthData, PerfUtils.getHealthReport());
    $.extend(healthData, FindUtils.getHealthReport());
    return healthData;
}

/**
 * Sets the health data
 * @param {Object} dataObject The object to be stored as health data
 */
function setHealthData(dataObject): void {
    if (!shouldLogHealthData()) {
        return;
    }
    PreferencesManager.setViewState(HEALTH_DATA_STATE_KEY, dataObject);
}

/**
 * Returns health data logged for the given key
 * @return {Object} Health Data object for the key or undefined if no health data stored
 */
export function getHealthDataLog(key: string): any {
    const healthData = getStoredHealthData();
    return healthData[key];
}

/**
 * Sets the health data for the given key
 * @param {Object} dataObject The object to be stored as health data for the key
 */
export function setHealthDataLog(key: string, dataObject): void {
    const healthData = getStoredHealthData();
    healthData[key] = dataObject;
    setHealthData(healthData);
}

/**
 * Clears all the health data recorded till now
 */
export function clearHealthData(): void {
    PreferencesManager.setViewState(HEALTH_DATA_STATE_KEY, {});
    // clear the performance related health data also
    PerfUtils.clear();
}

/**
 * Enable or disable health data logs
 * @param {boolean} enabled true to enable health logs
 */
export function setHealthLogsEnabled(enabled: boolean): void {
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
export function fileOpened(filePath: string, addedToWorkingSet = false, encoding: string | null): void {
    if (!shouldLogHealthData()) {
        return;
    }
    const fileExtension = FileUtils.getFileExtension(filePath);
    const language = LanguageManager.getLanguageForPath(filePath);
    const healthData = getStoredHealthData();
    let fileExtCountMap = {};
    healthData.fileStats = healthData.fileStats || {
        openedFileExt     : {},
        workingSetFileExt : {},
        openedFileEncoding: {}
    };
    if (language.getId() !== "unknown") {
        fileExtCountMap = addedToWorkingSet ? healthData.fileStats.workingSetFileExt : healthData.fileStats.openedFileExt;
        if (!fileExtCountMap[fileExtension]) {
            fileExtCountMap[fileExtension] = 0;
        }
        fileExtCountMap[fileExtension]++;
        setHealthData(healthData);
    }
    if (encoding) {
        let fileEncCountMap = healthData.fileStats.openedFileEncoding;
        if (!fileEncCountMap) {
            healthData.fileStats.openedFileEncoding = {};
            fileEncCountMap = healthData.fileStats.openedFileEncoding;
        }
        if (!fileEncCountMap[encoding]) {
            fileEncCountMap[encoding] = 0;
        }
        fileEncCountMap[encoding]++;
        setHealthData(healthData);
    }

    sendAnalyticsData(
        commonStrings.USAGE + commonStrings.FILE_OPEN + language._name,
        commonStrings.USAGE,
        commonStrings.FILE_OPEN,
        language._name!.toLowerCase()
    );
}

/**
 * Whenever a file is saved call this function.
 * The function will send the analytics Data
 * We only log the standard filetypes and fileSize
 * @param {String} filePath The path of the file to be registered
 */
export function fileSaved(docToSave: Document): void {
    if (!docToSave) {
        return;
    }

    const fileType = docToSave.language ? docToSave.language._name! : "";
    sendAnalyticsData(
        commonStrings.USAGE + commonStrings.FILE_SAVE + fileType,
        commonStrings.USAGE,
        commonStrings.FILE_SAVE,
        fileType.toLowerCase()
    );
}

/**
 * Whenever a file is closed call this function.
 * The function will send the analytics Data.
 * We only log the standard filetypes and fileSize
 * @param {String} filePath The path of the file to be registered
 */
export function fileClosed(file: File): void {
    if (!file) {
        return;
    }

    const language = LanguageManager.getLanguageForPath(file._path);
    let size = -1;

    function _sendData(fileSize: number): void {
        let subType = "";

        if (fileSize / 1024 <= 1) {

            if (fileSize < 0) {
                subType = "";
            }
            if (fileSize <= 10) {
                subType = "Size_0_10KB";
            } else if (fileSize <= 50) {
                subType = "Size_10_50KB";
            } else if (fileSize <= 100) {
                subType = "Size_50_100KB";
            } else if (fileSize <= 500) {
                subType = "Size_100_500KB";
            } else {
                subType = "Size_500KB_1MB";
            }

        } else {
            fileSize = fileSize / 1024;
            if (fileSize <= 2) {
                subType = "Size_1_2MB";
            } else if (fileSize <= 5) {
                subType = "Size_2_5MB";
            } else {
                subType = "Size_Above_5MB";
            }
        }

        sendAnalyticsData(
            commonStrings.USAGE + commonStrings.FILE_CLOSE + language._name + subType,
            commonStrings.USAGE,
            commonStrings.FILE_CLOSE,
            language._name!.toLowerCase(),
            subType
        );
    }

    file.stat(function (err, fileStat) {
        if (!err) {
            size = fileStat.size.valueOf() / 1024;
        }
        _sendData(size);
    });
}

/**
 * Sets the project details(a probably unique prjID, number of files in the project and the node cache size) in the health log
 * The name of the project is never saved into the health data log, only the hash(name) is for privacy requirements.
 * @param {string} projectName The name of the project
 * @param {number} numFiles    The number of file in the project
 * @param {number} cacheSize   The node file cache memory consumed by the project
 */
export function setProjectDetail(projectName: string, numFiles: number, cacheSize: number): void {
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
export function searchDone(searchType: string): void {
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

/**
 * Notifies the HealthData extension to send Analytics Data to server
 * @param{Object} eventParams Event Data to be sent to Analytics Server
 */
function notifyHealthManagerToSendData(eventParams): void {
    exports.trigger("SendAnalyticsData", eventParams);
}

/**
 * Send Analytics Data
 * @param {string} eventCategory The kind of Event Category that
 * needs to be logged- should be a js var compatible string
 * @param {string} eventSubCategory The kind of Event Sub Category that
 * needs to be logged- should be a js var compatible string
 * @param {string} eventType The kind of Event Type that needs to be logged- should be a js var compatible string
 * @param {string} eventSubType The kind of Event Sub Type that
 * needs to be logged- should be a js var compatible string
 */
export function sendAnalyticsData(eventName: string, eventCategory: string, eventSubCategory: string, eventType: string, eventSubType?: string): void {
    const isEventDataAlreadySent = analyticsEventMap.get(eventName);
    const isHDTracking   = PreferencesManager.getExtensionPrefs("healthData").get("healthDataTracking");
    let eventParams = {};

    if (isHDTracking && !isEventDataAlreadySent && eventName && eventCategory) {
        eventParams =  {
            eventName: eventName,
            eventCategory: eventCategory,
            eventSubCategory: eventSubCategory || "",
            eventType: eventType || "",
            eventSubType: eventSubType || ""
        };
        notifyHealthManagerToSendData(eventParams);
    }
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
