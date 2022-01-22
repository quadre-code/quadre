/*
 * Copyright (c) 2019 - 2021 Adobe. All rights reserved.
 * Copyright (c) 2022 - present The quadre code authors. All rights reserved.
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

import * as PreferencesManager from "preferences/PreferencesManager";

/**
 * Comparator to sort providers from high to low priority
 */
function _providerSort(a, b) {
    return b.priority - a.priority;
}

export class RegistrationHandler {
    private _providers: { [key: string]: Array<any> };

    constructor() {
        this._providers = {
            "all": []
        };
    }

    /**
     * The method by which a Provider registers its willingness to
     * providing tooling feature for editors in a given language.
     *
     * @param {!Provider} provider
     * The provider to be registered, described below.
     *
     * @param {!Array.<string>} languageIds
     * The set of language ids for which the provider is capable of
     * providing tooling feature. If the special language id name "all" is included then
     * the provider may be called for any language.
     *
     * @param {?number} priority
     * Used to break ties among providers for a particular language.
     * Providers with a higher number will be asked for tooling before those
     * with a lower priority value. Defaults to zero.
     */
    public registerProvider(providerInfo, languageIds: Array<string>, priority: number | null): void {
        const providerObj = {
            provider: providerInfo,
            priority: priority || 0
        };
        const self = this;

        if (languageIds.indexOf("all") !== -1) {
            // Ignore anything else in languageIds and just register for every language. This includes
            // the special "all" language since its key is in the hintProviders map from the beginning.
            for (const languageId in self._providers) {
                if (self._providers.hasOwnProperty(languageId)) {
                    self._providers[languageId].push(providerObj);
                    self._providers[languageId].sort(_providerSort);
                }
            }
        } else {
            languageIds.forEach(function (languageId) {
                if (!self._providers[languageId]) {
                    // Initialize provider list with any existing all-language providers
                    self._providers[languageId] = Array.prototype.concat(self._providers.all);
                }
                self._providers[languageId].push(providerObj);
                self._providers[languageId].sort(_providerSort);
            });
        }
    }

    /**
     * Remove a code hint provider
     * @param {!CodeHintProvider} provider Code hint provider to remove
     * @param {(string|Array.<string>)=} targetLanguageId Optional set of
     *     language IDs for languages to remove the provider for. Defaults
     *     to all languages.
     */
    public removeProvider(provider, targetLanguageId: (string | Array<string>) | undefined): void {
        let targetLanguageIdArr;
        const self = this;

        if (Array.isArray(targetLanguageId)) {
            targetLanguageIdArr = targetLanguageId;
        } else if (targetLanguageId) {
            targetLanguageIdArr = [targetLanguageId];
        } else {
            targetLanguageIdArr = Object.keys(self._providers);
        }

        targetLanguageIdArr.forEach(function (languageId) {
            const providers = self._providers[languageId];

            for (let index = 0; index < providers.length; index++) {
                if (providers[index].provider === provider) {
                    providers.splice(index, 1);
                    break;
                }
            }
        });
    }

    public getProvidersForLanguageId(languageId?) {
        const providers = this._providers[languageId] || this._providers.all;

        // Exclude providers that are explicitly disabled in the preferences.
        // All providers that do not have their constructor
        // names listed in the preferences are enabled by default.
        return providers.filter(function (provider) {
            const prefKey = "tooling." + provider.provider.constructor.name;
            return PreferencesManager.get(prefKey) !== false;
        });
    }
}
