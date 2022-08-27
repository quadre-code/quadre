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
 * Defines a ChangedDocumentTracker class to monitor changes to files in the current project.
 */

import type { Document } from "document/Document";

import * as DocumentManager from "document/DocumentManager";
import * as ProjectManager from "project/ProjectManager";
import { DispatcherEvents } from "utils/EventDispatcher";

/**
 * Tracks "change" events on opened Documents. Used to monitor changes
 * to documents in-memory and update caches. Assumes all documents have
 * changed when the Brackets window loses and regains focus. Does not
 * read timestamps of files on disk. Clients may optionally track file
 * timestamps on disk independently.
 * @constructor
 */
class ChangedDocumentTracker {
    private _changedPaths: Record<string, boolean>;
    private _windowFocus: boolean;

    constructor() {
        const self = this;

        this._changedPaths = {};
        this._windowFocus = true;
        this._addListener = this._addListener.bind(this);
        this._removeListener = this._removeListener.bind(this);
        this._onChange = this._onChange.bind(this);
        this._onWindowFocus = this._onWindowFocus.bind(this);

        (DocumentManager as unknown as DispatcherEvents).on("afterDocumentCreate", function (event, doc) {
            // Only track documents in the current project
            if (ProjectManager.isWithinProject(doc.file.fullPath)) {
                self._addListener(doc);
            }
        });

        (DocumentManager as unknown as DispatcherEvents).on("beforeDocumentDelete", function (event, doc) {
            // In case a document somehow remains loaded after its project
            // has been closed, unconditionally attempt to remove the listener.
            self._removeListener(doc);
        });

        $(window).focus(this._onWindowFocus);
    }

    /**
     * @private
     * Assumes all files are changed when the window loses and regains focus.
     */
    private _addListener(doc: Document): void {
        doc.on("change", this._onChange);
    }

    /**
     * @private
     */
    private _removeListener(doc: Document): void {
        doc.off("change", this._onChange);
    }

    /**
     * @private
     * Assumes all files are changed when the window loses and regains focus.
     */
    private _onWindowFocus(event, doc: Document): void {
        this._windowFocus = true;
    }

    /**
     * @private
     * Tracks changed documents.
     */
    private _onChange(event, doc: Document): void {
        // if it was already changed, and the client hasn't reset the tracker,
        // then leave it changed.
        this._changedPaths[doc.file.fullPath] = true;
    }

    /**
     * Empty the set of dirty paths. Begin tracking new dirty documents.
     */
    public reset(): void {
        this._changedPaths = {};
        this._windowFocus = false;
    }

    /**
     * Check if a file path is dirty.
     * @param {!string} file path
     * @return {!boolean} Returns true if the file was dirtied since the last reset.
     */
    public isPathChanged(path: string): boolean {
        return this._windowFocus || this._changedPaths[path];
    }

    /**
     * Get the set of changed paths since the last reset.
     * @return {Array.<string>} Changed file paths
     */
    public getChangedPaths(): Array<string> {
        return $.makeArray(this._changedPaths);
    }
}

export = ChangedDocumentTracker;
