/*
 * Copyright (c) 2012 - 2017 Adobe Systems Incorporated. All rights reserved.
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
 * This is a collection of utility functions for gathering performance data.
 */

import * as _ from "lodash";
import * as StringUtils from "utils/StringUtils";

// make sure the global brackets variable is loaded
import "utils/Global";

/**
 * Flag to enable/disable performance data gathering. Default is true (enabled)
 * @type {boolean} enabled
 */
const enabled = brackets && !!brackets.app.getElapsedMilliseconds;

/**
 * Peformance data is stored in this hash object. The key is the name of the
 * test (passed to markStart/addMeasurement), and the value is the time, in
 * milliseconds, that it took to run the test. If multiple runs of the same test
 * are made, the value is an Array with each run stored as an entry in the Array.
 */
let perfData = {};

/**
 * Active tests. This is a hash of all tests that have had markStart() called,
 * but have not yet had addMeasurement() called.
 */
let activeTests = {};

/**
 * Updatable tests. This is a hash of all tests that have had markStart() called,
 * and have had updateMeasurement() called. Caller must explicitly remove tests
 * from this list using finalizeMeasurement()
 */
let updatableTests = {};

/**
 * @private
 * Keeps the track of measurements sequence number for re-entrant sequences with
 * the same name currently running. Entries are created and deleted as needed.
 */
let _reentTests = {};

/**
 * @private
 * A unique key to log performance data
 *
 * @param {(string|undefined)} id Unique ID for this measurement name
 * @param {!string} name A short name for this measurement
 * @param {?number} reent Sequence identifier for parallel tests of the same name
 */
class PerfMeasurement {
    private name;
    private reent;
    public id;

    constructor(id, name, reent?) {
        this.name = name;
        this.reent = reent;
        if (id) {
            this.id = id;
        } else {
            this.id = (reent) ? "[reent " + this.reent + "] " + name : name;
        }
    }

    /**
     * Override toString() to allow using PerfMeasurement as an array key without
     * explicit conversion.
     */
    public toString() {
        return this.name;
    }
}

/**
 * Create a new PerfMeasurement key. Adds itself to the module export.
 * Can be accessed on the module, e.g. PerfUtils.MY_PERF_KEY.
 *
 * @param {!string} id Unique ID for this measurement name
 * @param {!name} name A short name for this measurement
 */
export function createPerfMeasurement(id, name) {
    const pm = new PerfMeasurement(id, name);
    exports[id] = pm;

    return pm;
}

/**
 * @private
 * Generates PerfMeasurements based on the name or array of names.
 */
function _generatePerfMeasurements(name) {
    // always convert it to array so that the rest of the routines could rely on it
    const id = (!Array.isArray(name)) ? [name] : name;
    // generate unique identifiers for each name
    let i;
    for (i = 0; i < id.length; i++) {
        if (!(id[i] instanceof PerfMeasurement)) {
            if (_reentTests[id[i]] === undefined) {
                _reentTests[id[i]] = 0;
            } else {
                _reentTests[id[i]]++;
            }
            id[i] = new PerfMeasurement(undefined, id[i], _reentTests[id[i]]);
        }
    }
    return id;
}

/**
 * @private
 * Helper function for markStart()
 *
 * @param {Object} id  Timer id.
 * @param {number} time  Timer start time.
 */
function _markStart(id, time) {
    if (activeTests[id.id]) {
        console.warn("Recursive tests with the same id are not supported. Timer id: " + id.id);
    }

    activeTests[id.id] = { startTime: time };
}

/**
 * Start a new named timer. The name should be as descriptive as possible, since
 * this name will appear as an entry in the performance report.
 * For example: "Open file: /Users/brackets/src/ProjectManager.js"
 *
 * Multiple timers can be opened simultaneously.
 *
 * Returns an opaque set of timer ids which can be stored and used for calling
 * addMeasurement(). Since name is often creating via concatenating strings this
 * return value allows clients to construct the name once.
 *
 * @param {(string|Array.<string>)} name  Single name or an Array of names.
 * @return {(Object|Array.<Object>)} Opaque timer id or array of timer ids.
 */
export function markStart(name) {
    if (!enabled) {
        return;
    }

    const time = brackets.app.getElapsedMilliseconds();
    const id = _generatePerfMeasurements(name);
    let i;

    for (i = 0; i < id.length; i++) {
        _markStart(id[i], time);
    }
    return id.length > 1 ? id : id[0];
}

/**
 * Stop a timer and add its measurements to the performance data.
 *
 * Multiple measurements can be stored for any given name. If there are
 * multiple values for a name, they are stored in an Array.
 *
 * If markStart() was not called for the specified timer, the
 * measured time is relative to app startup.
 *
 * @param {Object} id  Timer id.
 */
export function addMeasurement(id) {
    if (!enabled) {
        return;
    }

    if (!(id instanceof PerfMeasurement)) {
        id = new PerfMeasurement(id, id);
    }

    let elapsedTime = brackets.app.getElapsedMilliseconds();

    if (activeTests[id.id]) {
        elapsedTime -= activeTests[id.id].startTime;
        delete activeTests[id.id];
    }

    if (perfData[id]) {
        // We have existing data, add to it
        if (Array.isArray(perfData[id])) {
            perfData[id].push(elapsedTime);
        } else {
            // Current data is a number, convert to Array
            perfData[id] = [perfData[id], elapsedTime];
        }
    } else {
        perfData[id] = elapsedTime;
    }

    if (id.reent !== undefined) {
        if (_reentTests[id] === 0) {
            delete _reentTests[id];
        } else {
            _reentTests[id]--;
        }
    }

}

/**
 * This function is similar to addMeasurement(), but it allows timing the
 * *last* event, when you don't know which event will be the last one.
 *
 * Tests that are in the activeTests list, have not yet been added, so add
 * measurements to the performance data, and move test to updatableTests list.
 * A test is moved to the updatable list so that it no longer passes isActive().
 *
 * Tests that are already in the updatableTests list are updated.
 *
 * Caller must explicitly remove test from the updatableTests list using
 * finalizeMeasurement().
 *
 * If markStart() was not called for the specified timer, there is no way to
 * determine if this is the first or subsequent call, so the measurement is
 * not updatable, and it is handled in addMeasurement().
 *
 * @param {Object} id  Timer id.
 */
export function updateMeasurement(id) {
    let elapsedTime = brackets.app.getElapsedMilliseconds();

    if (updatableTests[id.id]) {
        // update existing measurement
        elapsedTime -= updatableTests[id].startTime;

        // update
        if (perfData[id] && Array.isArray(perfData[id])) {
            // We have existing data and it's an array, so update the last entry
            perfData[id][perfData[id].length - 1] = elapsedTime;
        } else {
            // No current data or a single entry, so set/update it
            perfData[id] = elapsedTime;
        }

    } else {
        // not yet in updatable list

        if (activeTests[id.id]) {
            // save startTime in updatable list before addMeasurement() deletes it
            updatableTests[id.id] = { startTime: activeTests[id.id].startTime };
        }

        // let addMeasurement() handle the initial case
        addMeasurement(id);
    }
}

/**
 * Remove timer from lists so next action starts a new measurement
 *
 * updateMeasurement may not have been called, so timer may be
 * in either or neither list, but should never be in both.
 *
 * @param {Object} id  Timer id.
 */
export function finalizeMeasurement(id) {
    if (activeTests[id.id]) {
        delete activeTests[id.id];
    }

    if (updatableTests[id.id]) {
        delete updatableTests[id.id];
    }
}

/**
 * Returns whether a timer is active or not, where "active" means that
 * timer has been started with addMark(), but has not been added to perfdata
 * with addMeasurement().
 *
 * @param {Object} id  Timer id.
 * @return {boolean} Whether a timer is active or not.
 */
export function isActive(id) {
    return (activeTests[id.id]) ? true : false;
}

/**
 * return single value, or comma separated values for an array or return aggregated values with
 * <min value, average, max value, standard deviation>
 * @param   {Array}    entry          An array or a single value
 * @param   {Boolean} aggregateStats If set, the returned value will be aggregated in the form -
 *                                   <min(avg)max[standard deviation]>
 * @return {String}   a single value, or comma separated values in an array or
 *                     <min(avg)max[standard deviation]> if aggregateStats is set
 */
function getValueAsString(entry, aggregateStats?) {
    if (!Array.isArray(entry)) {
        return entry;
    }

    if (aggregateStats) {
        let sum = 0;
        const min = _.min(entry);
        const max = _.max(entry);
        let variationSum = 0;

        entry.forEach(function (value) {
            sum += value;
        });
        const avg = Math.round(sum / entry.length);
        entry.forEach(function (value) {
            variationSum += Math.pow(value - avg, 2);
        });
        const sd = Math.round(Math.sqrt(variationSum / entry.length));
        return min + "(" + avg + ")" + max + "[" + sd + "]";
    }

    return entry.join(", ");
}

/**
 * Returns the performance data as a tab delimited string
 * @return {string}
 */
export function getDelimitedPerfData() {
    let result = "";
    _.forEach(perfData, function (entry, testName) {
        result += getValueAsString(entry) + "\t" + testName + "\n";
    });

    return result;
}

/**
 * Returns the measured value for the given measurement name.
 * @param {Object} id The measurement to retreive.
 */
export function getData(id) {
    if (!id) {
        return perfData;
    }

    return perfData[id];
}

/**
 * Returns the Performance metrics to be logged for health report
 * @return {Object} An object with the health data logs to be sent
 */
export function getHealthReport() {
    interface HealthReport {
        AppStartupTime?: string;
        ModuleDepsResolved?: string;
        projectLoadTimes: string;
        fileOpenTimes: string;
    }

    const healthReport: HealthReport = {
        projectLoadTimes : "",
        fileOpenTimes : ""
    };

    _.forEach(perfData, function (entry, testName) {
        if (StringUtils.startsWith(testName, "Application Startup")) {
            healthReport.AppStartupTime = getValueAsString(entry);
        } else if (StringUtils.startsWith(testName, "brackets module dependencies resolved")) {
            healthReport.ModuleDepsResolved = getValueAsString(entry);
        } else if (StringUtils.startsWith(testName, "Load Project")) {
            healthReport.projectLoadTimes += ":" + getValueAsString(entry, true);
        } else if (StringUtils.startsWith(testName, "Open File")) {
            healthReport.fileOpenTimes += ":" + getValueAsString(entry, true);
        }
    });

    return healthReport;
}

export function searchData(regExp) {
    const keys = Object.keys(perfData).filter(function (key) {
        return regExp.test(key);
    });

    const datas: Array<any> = [];

    keys.forEach(function (key) {
        datas.push(perfData[key]);
    });

    return datas;
}

/**
 * Clear all logs including metric data and active tests.
 */
export function clear() {
    perfData = {};
    activeTests = {};
    updatableTests = {};
    _reentTests = {};
}

// create performance measurement constants
createPerfMeasurement("INLINE_WIDGET_OPEN", "Open inline editor or docs");
createPerfMeasurement("INLINE_WIDGET_CLOSE", "Close inline editor or docs");

// extensions may create additional measurement constants during their lifecycle
