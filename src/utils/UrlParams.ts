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

import * as _ from "lodash";

interface StoreMap {
    [name: string]: string | boolean;
}

/**
 * Convert between URL querystring and name/value pairs. Decodes and encodes URL parameters.
 */
export class UrlParams {
    private _store: StoreMap;

    constructor() {
        this._store = {};
    }

    /**
     * Parse the window location by default. Optionally specify a URL to parse.
     * @param {string} url
     */
    public parse(url?: string): void {
        let queryString = "";
        let urlParams;
        let p;
        const self = this;

        self._store = {};

        if (!url) {
            queryString = window.document.location.search.substring(1);
        } else if (url.indexOf("?") !== -1) {
            queryString = url.substring(url.indexOf("?") + 1);
        }

        queryString = queryString.trimRight();

        if (queryString) {
            urlParams = queryString.split("&");

            urlParams.forEach(function (param) {
                p = param.split("=");
                p[1] = p[1] || "";
                self._store[decodeURIComponent(p[0])] = decodeURIComponent(p[1]);
            });
        }
    }

    /**
     * Store a name/value string pair
     * @param {!string} name
     * @param {!string} value
     */
    public put(name: string, value: string | boolean): void {
        this._store[name] = value;
    }

    /**
     * Retrieve a value by name
     * @param {!string} name
     * @return {string}
     */
    public get<T extends string | boolean>(name: string): T {
        return this._store[name] as T;
    }

    /**
     * Remove a name/value string pair
     * @param {!string} name
     */
    public remove(name: string): void {
        delete this._store[name];
    }

    /**
     * Returns true if the parameter list is empty, else returns false.
     * @return {boolean}
     */
    public isEmpty(): boolean {
        return _.isEmpty(this._store);
    }

    /**
     * Encode name/value pairs as URI components.
     * @return {string}
     */
    public toString(): string {
        const strs: Array<string> = [];
        const self = this;

        _.forEach(self._store, function (value, key: string) {
            strs.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
        });

        return strs.join("&");
    }
}
