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

/*unittests: ExtensionManager*/

import * as _ from "lodash";

import * as ExtensionManager from "extensibility/ExtensionManager";
import * as registryUtils from "extensibility/registry_utils";
import * as EventDispatcher from "utils/EventDispatcher";
import * as Strings from "strings";
import * as PreferencesManager from "preferences/PreferencesManager";

export enum Source {
    REGISTRY = "registry",
    THEMES = "themes",
    INSTALLED = "installed",
    DEFAULT = "default"
}

/**
 * @private
 * @type {Array}
 * A list of fields to search when trying to search for a query string in an object. Each field is
 * represented as an array of keys to recurse downward through the object. We store this here to avoid
 * doing it for each search call.
 */
const _searchFields = [["metadata", "name"], ["metadata", "title"], ["metadata", "description"],
    ["metadata", "author", "name"], ["metadata", "keywords"], ["owner"]];

/**
 * The base model for the ExtensionManagerView. Keeps track of the extensions that are currently visible
 * and manages sorting/filtering them. Must be disposed with dispose() when done.
 * Events:
 * - change - triggered when the data for a given extension changes. Second parameter is the extension id.
 * - filter - triggered whenever the filtered set changes (including on initialize).
 *
 * @constructor
 */
export abstract class ExtensionManagerViewModel extends EventDispatcher.EventDispatcherBase {
    /**
     * @type {string}
     * Constant indicating that this model/view should initialize from the main extension registry.
     */
    public SOURCE_REGISTRY = "registry";

    /**
     * @type {string}
     * Constant indicating that this model/view should initialize from the main extension registry with only themes.
     */
    public SOURCE_THEMES = "themes";

    /**
     * @type {string}
     * Constant indicating that this model/view should initialize from the list of locally installed extensions.
     */
    public SOURCE_INSTALLED = "installed";

    /**
     * @type {string}
     * Constant indicating that this model/view should initialize from the list of default bundled extensions.
     */
    public SOURCE_DEFAULT = "default";

    /**
     * @type {Object}
     * The current set of extensions managed by this model. Same as ExtensionManager.extensions.
     */
    public extensions;

    /**
     * @type {string}
     * The current source for the model; one of the SOURCE_* keys above.
     */
    public abstract source: Source;

    /**
     * @type {Array.<Object>}
     * The list of IDs of items matching the current query and sorted with the current sort.
     */
    public filterSet: Array<any>;

    /**
     * @type {Object}
     * The list of all ids from the extension list, sorted with the current sort.
     */
    public sortedFullSet: Array<any>;

    /**
     * @private
     * @type {string}
     * The last query we filtered by. Used to optimize future searches.
     */
    protected _lastQuery = null;

    /**
     * @type {string}
     * Info message to display to the user when listing extensions
     */
    public infoMessage: string;

    /**
     * @type {string}
     * An optional message to display to the user
     */
    public message: string | null = null;

    /**
     * @type {number}
     * Number to show in tab's notification icon. No icon shown if 0.
     */
    public notifyCount = 0;

    /**
     * @private {$.Promise}
     * Internal use only to track when initialization fails, see usage in _updateMessage.
     */
    private _initializeFromSourcePromise: JQueryPromise<any>;

    public scrollPos;

    constructor(source: Source) {
        super();

        this._handleStatusChange = this._handleStatusChange.bind(this);

        // Listen for extension status changes.
        (ExtensionManager as unknown as EventDispatcher.DispatcherEvents)
            .on("statusChange." + source, this._handleStatusChange)
            .on("registryUpdate." + source, this._handleStatusChange);
    }

    /**
     * Unregisters listeners when we're done.
     */
    public dispose() {
        (ExtensionManager as unknown as EventDispatcher.DispatcherEvents).off("." + this.source);
    }

    /**
     * @private
     * Sets up the initial filtered set based on the sorted full set.
     */
    protected _setInitialFilter() {
        // Initial filtered list is the same as the sorted list.
        this.filterSet = _.clone(this.sortedFullSet);
        this.trigger("filter");
    }

    /**
     * @private
     * Re-sorts the current full set based on the source we're viewing.
     * The base implementation does nothing.
     */
    protected _sortFullSet() {
        /* Do nothing */
    }

    protected abstract _initializeFromSource(): JQueryPromise<any>;

    /**
     * Initializes the model from the source.
     */
    public initialize() {
        const self = this;

        this._initializeFromSourcePromise = this._initializeFromSource().always(function () {
            self._updateMessage();
        });

        return this._initializeFromSourcePromise;
    }

    /**
     * @private
     * Updates the initial set and filter as necessary when the status of an extension changes,
     * and notifies listeners of the change.
     * @param {$.Event} e The jQuery event object.
     * @param {string} id The id of the extension whose status changed.
     */
    protected _handleStatusChange(e, id) {
        this.trigger("change", id);
    }

    /**
     * @private
     * Searches for the given query in the current extension list and updates the filter set,
     * dispatching a filter event.
     * @param {string} query The string to search for.
     * @param {boolean} force If true, always filter starting with the full set, not the last
     *     query's filter.
     */
    public filter(query, force?) {
        const self = this;
        let initialList;
        if (!force && this._lastQuery && query.indexOf(this._lastQuery) === 0) {
            // This is the old query with some new letters added, so we know we can just
            // search in the current filter set. (This is true even if query has spaces).
            initialList = this.filterSet;
        } else {
            // This is a new query, so start with the full list.
            initialList = this.sortedFullSet;
        }

        const keywords = query.toLowerCase().split(/\s+/);

        // Takes 'extensionList' and returns a version filtered to only those that match 'keyword'
        function filterForKeyword(extensionList, word) {
            const filteredList: Array<string> = [];
            extensionList.forEach(function (id) {
                const entry = self._getEntry(id);
                if (entry && self._entryMatchesQuery(entry, word)) {
                    filteredList.push(id);
                }
            });
            return filteredList;
        }

        // "AND" the keywords together: successively filter down the result set by each keyword in turn
        let currentList = initialList;
        for (const keyword of keywords) {
            currentList = filterForKeyword(currentList, keyword);
        }

        this._lastQuery = query;
        this.filterSet = currentList;

        this._updateMessage();

        this.trigger("filter");
    }

    /**
     * @private
     * Updates an optional message displayed to the user along with the extension list.
     */
    private _updateMessage() {
        if (this._initializeFromSourcePromise && this._initializeFromSourcePromise.state() === "rejected") {
            this.message = Strings.EXTENSION_MANAGER_ERROR_LOAD;
        } else if (this.filterSet && this.filterSet.length === 0) {
            this.message = this.sortedFullSet && this.sortedFullSet.length ? Strings.NO_EXTENSION_MATCHES : Strings.NO_EXTENSIONS;
        } else {
            this.message = null;
        }
    }

    /**
     * @private
     * This is to be overridden by subclasses to provide the metadata for the extension
     * with the provided `id`.
     *
     * @param {string} id of the extension
     * @return {Object?} extension metadata or null if there's no matching extension
     */
    public abstract _getEntry(id);

    /**
     * @private
     * Tests if the given entry matches the query.
     * @param {Object} entry The extension entry to test.
     * @param {string} query The query to match against.
     * @return {boolean} Whether the query matches.
     */
    private _entryMatchesQuery(entry, query) {
        return query === "" ||
            _searchFields.some(function (fieldSpecs) {
                let cur = entry;
                for (const fieldSpec of fieldSpecs) {
                    // Recurse downward through the specified fields to the leaf value.
                    cur = cur[fieldSpec];
                    if (!cur) {
                        return false;
                    }
                }
                // If the leaf value is an array (like keywords), search each item, otherwise
                // just search in the string.
                if (Array.isArray(cur)) {
                    return cur.some(function (keyword) {
                        return keyword.toLowerCase().indexOf(query) !== -1;
                    });
                }

                if (fieldSpecs[fieldSpecs.length - 1] === "owner") {
                    // Special handling: ignore the authentication source when querying,
                    // since it's not useful to search on
                    const components = cur.split(":");
                    if (components[1].toLowerCase().indexOf(query) !== -1) {
                        return true;
                    }
                } else if (cur.toLowerCase().indexOf(query) !== -1) {
                    return true;
                }

                return false;
            });
    }

    public _setSortedExtensionList(extensions, isTheme) {
        this.filterSet = this.sortedFullSet = registryUtils.sortRegistry(extensions, "registryInfo", PreferencesManager.get("extensions.sort"))
            .filter(function (entry) {
                if (!isTheme) {
                    return entry.registryInfo && !entry.registryInfo.metadata.theme;
                }

                return entry.registryInfo && entry.registryInfo.metadata.theme;
            })
            .map(function (entry) {
                return entry.registryInfo.metadata.name;
            });
    }
}


/**
 * The model for the ExtensionManagerView that is responsible for handling registry-based extensions.
 * This extends ExtensionManagerViewModel.
 * Must be disposed with dispose() when done.
 *
 * Events:
 * - change - triggered when the data for a given extension changes. Second parameter is the extension id.
 * - filter - triggered whenever the filtered set changes (including on initialize).
 *
 * @constructor
 */
export class RegistryViewModel extends ExtensionManagerViewModel {
    /**
     * @type {string}
     * RegistryViewModels always have a source of SOURCE_REGISTRY.
     */
    public source = Source.REGISTRY;

    constructor() {
        super(Source.REGISTRY);
        this.infoMessage = Strings.REGISTRY_SANITY_CHECK_WARNING;
    }

    /**
     * Initializes the model from the remote extension registry.
     * @return {$.Promise} a promise that's resolved with the registry JSON data
     * or rejected if the server can't be reached.
     */
    protected _initializeFromSource() {
        const self = this;
        return ExtensionManager.downloadRegistry()
            .done(function () {
                self.extensions = ExtensionManager.extensions;

                // Sort the registry by last published date and store the sorted list of IDs.
                self._setSortedExtensionList(ExtensionManager.extensions, false);
                self._setInitialFilter();
            })
            .fail(function () {
                self.extensions = [];
                self.sortedFullSet = [];
                self.filterSet = [];
            });
    }

    /**
     * @private
     * Finds the extension metadata by id. If there is no extension matching the given id,
     * this returns `null`.
     * @param {string} id of the extension
     * @return {Object?} extension metadata or null if there's no matching extension
     */
    public _getEntry(id) {
        const entry = this.extensions[id];
        if (entry) {
            return entry.registryInfo;
        }
        return entry;
    }
}


/**
 * The model for the ExtensionManagerView that is responsible for handling previously-installed extensions.
 * This extends ExtensionManagerViewModel.
 * Must be disposed with dispose() when done.
 *
 * Events:
 * - change - triggered when the data for a given extension changes. Second parameter is the extension id.
 * - filter - triggered whenever the filtered set changes (including on initialize).
 *
 * @constructor
 */
export class InstalledViewModel extends ExtensionManagerViewModel {
    /**
     * @type {string}
     * InstalledViewModels always have a source of SOURCE_INSTALLED.
     */
    public source = Source.INSTALLED;

    constructor() {
        super(Source.INSTALLED);

        // when registry is downloaded, sort extensions again - those with updates will be before others
        const self = this;
        (ExtensionManager as unknown as EventDispatcher.DispatcherEvents).on("registryDownload." + this.source, function () {
            self._sortFullSet();
            self._setInitialFilter();
        });
    }

    /**
     * Initializes the model from the set of locally installed extensions, sorted
     * alphabetically by id (or name of the extension folder for legacy extensions).
     * @return {$.Promise} a promise that's resolved when we're done initializing.
     */
    protected _initializeFromSource() {
        const self = this;
        this.extensions = ExtensionManager.extensions;
        this.sortedFullSet = Object.keys(this.extensions)
            .filter(function (key) {
                return self.extensions[key].installInfo &&
                    self.extensions[key].installInfo.locationType !== ExtensionManager.LOCATION_DEFAULT;
            });
        this._sortFullSet();
        this._setInitialFilter();
        this._countUpdates();

        return $.Deferred().resolve().promise();
    }

    /**
     * @private
     * Re-sorts the current full set
     */
    protected _sortFullSet() {
        const self = this;

        this.sortedFullSet = this.sortedFullSet.sort(function (key1, key2) {
            // before sorting by name, put first extensions that have updates
            const ua1 = self.extensions[key1].installInfo.updateAvailable;
            const ua2 = self.extensions[key2].installInfo.updateAvailable;

            if (ua1 && !ua2) {
                return -1;
            }

            if (!ua1 && ua2) {
                return 1;
            }

            const metadata1 = self.extensions[key1].installInfo.metadata;
            const metadata2 = self.extensions[key2].installInfo.metadata;
            const id1 = (metadata1.title || metadata1.name).toLocaleLowerCase();
            const id2 = (metadata2.title || metadata2.name).toLocaleLowerCase();

            return id1.localeCompare(id2);
        });
    }

    /**
     * @private
     * Updates notifyCount based on number of extensions with an update available
     */
    private _countUpdates() {
        const self = this;
        this.notifyCount = 0;
        this.sortedFullSet.forEach(function (key) {
            if (self.extensions[key].installInfo.updateCompatible && !ExtensionManager.isMarkedForUpdate(key)) {
                self.notifyCount++;
            }
        });
    }

    /**
     * @private
     * Updates the initial set and filter as necessary when the status of an extension changes,
     * and notifies listeners of the change.
     * @param {$.Event} e The jQuery event object.
     * @param {string} id The id of the extension whose status changed.
     */
    protected _handleStatusChange(e, id) {
        const index = this.sortedFullSet.indexOf(id);
        let refilter = false;
        if (index !== -1 && !this.extensions[id].installInfo) {
            // This was in our set, but was uninstalled. Remove it.
            this.sortedFullSet.splice(index, 1);
            this._countUpdates();  // may also affect update count
            refilter = true;
        } else if (index === -1 && this.extensions[id].installInfo) {
            // This was not in our set, but is now installed. Add it and resort.
            this.sortedFullSet.push(id);
            this._sortFullSet();
            refilter = true;
        }
        if (refilter) {
            this.filter(this._lastQuery || "", true);
        }

        if (this.extensions[id].installInfo) {
            // If our count of available updates may have been affected, re-count
            this._countUpdates();
        }

        super._handleStatusChange(e, id);
    }

    /**
     * @private
     * Finds the extension metadata by id. If there is no extension matching the given id,
     * this returns `null`.
     * @param {string} id of the extension
     * @return {Object?} extension metadata or null if there's no matching extension
     */
    public _getEntry(id) {
        const entry = this.extensions[id];
        if (entry) {
            return entry.installInfo;
        }
        return entry;
    }
}


/**
 * Model for displaying default extensions that come bundled with Brackets
 */
export class DefaultViewModel extends ExtensionManagerViewModel {
    /**
     * Add SOURCE_DEFAULT to DefaultViewModel
     */
    public source = Source.DEFAULT;

    constructor() {
        super(Source.DEFAULT);
    }

    /**
     * Initializes the model from the set of default extensions, sorted alphabetically by id
     * @return {$.Promise} a promise that's resolved when we're done initializing.
     */
    protected _initializeFromSource() {
        const self = this;
        this.extensions = ExtensionManager.extensions;
        this.sortedFullSet = Object.keys(this.extensions)
            .filter(function (key) {
                return self.extensions[key].installInfo &&
                    self.extensions[key].installInfo.locationType === ExtensionManager.LOCATION_DEFAULT;
            });
        this._sortFullSet();
        this._setInitialFilter();
        return $.Deferred().resolve().promise();
    }

    /**
     * @private
     * Re-sorts the current full set
     */
    protected _sortFullSet() {
        const self = this;
        this.sortedFullSet = this.sortedFullSet.sort(function (key1, key2) {
            const metadata1 = self.extensions[key1].installInfo.metadata;
            const metadata2 = self.extensions[key2].installInfo.metadata;
            const id1 = (metadata1.title || metadata1.name).toLocaleLowerCase();
            const id2 = (metadata2.title || metadata2.name).toLocaleLowerCase();
            return id1.localeCompare(id2);
        });
    }

    /**
     * @private
     * Finds the default extension metadata by id. If there is no default extension matching the given id,
     * this returns `null`.
     * @param {string} id of the theme extension
     * @return {Object?} extension metadata or null if there's no matching extension
     */
    public _getEntry(id) {
        return this.extensions[id] ? this.extensions[id].installInfo : null;
    }
}


/**
 * The model for the ExtensionManagerView that is responsible for handling registry-based theme extensions.
 * This extends ExtensionManagerViewModel.
 * Must be disposed with dispose() when done.
 *
 * Events:
 * - change - triggered when the data for a given extension changes. Second parameter is the extension id.
 * - filter - triggered whenever the filtered set changes (including on initialize).
 *
 * @constructor
 */
export class ThemesViewModel extends ExtensionManagerViewModel {
    /**
     * @type {string}
     * ThemeViewModels always have a source of SOURCE_THEMES.
     */
    public source = Source.THEMES;

    constructor() {
        super(Source.THEMES);
    }

    /**
     * Initializes the model from the remote extension registry.
     * @return {$.Promise} a promise that's resolved with the registry JSON data.
     */
    protected _initializeFromSource() {
        const self = this;
        return ExtensionManager.downloadRegistry()
            .done(function () {
                self.extensions = ExtensionManager.extensions;

                // Sort the registry by last published date and store the sorted list of IDs.
                self._setSortedExtensionList(ExtensionManager.extensions, true);
                self._setInitialFilter();
            })
            .fail(function () {
                self.extensions = [];
                self.sortedFullSet = [];
                self.filterSet = [];
            });
    }

    /**
     * @private
     * Finds the theme extension metadata by id. If there is no theme extension matching the given id,
     * this returns `null`.
     * @param {string} id of the theme extension
     * @return {Object?} extension metadata or null if there's no matching extension
     */
    public _getEntry(id) {
        const entry = this.extensions[id];
        if (entry) {
            return entry.registryInfo;
        }
        return entry;
    }
}
