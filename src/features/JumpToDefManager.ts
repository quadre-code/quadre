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

import * as Commands from "command/Commands";
import * as Strings from "strings";
import * as CommandManager from "command/CommandManager";
import * as EditorManager from "editor/EditorManager";
import { RegistrationHandler as ProviderRegistrationHandler } from "features/PriorityBasedRegistration";

const _providerRegistrationHandler = new ProviderRegistrationHandler();
export const registerJumpToDefProvider = _providerRegistrationHandler.registerProvider.bind(_providerRegistrationHandler);
export const removeJumpToDefProvider = _providerRegistrationHandler.removeProvider.bind(_providerRegistrationHandler);


/**
 * Asynchronously asks providers to handle jump-to-definition.
 * @return {!Promise} Resolved when the provider signals that it's done; rejected if no
 * provider responded or the provider that responded failed.
 */
function _doJumpToDef() {
    const result = $.Deferred();
    let jumpToDefProvider: any = null;
    const editor = EditorManager.getActiveEditor();

    if (editor) {
        // Find a suitable provider, if any
        const language = editor.getLanguageForSelection();
        const enabledProviders = _providerRegistrationHandler.getProvidersForLanguageId(language.getId());

        enabledProviders.some(function (item, index) {
            const provider: any = item.provider;
            if (provider.canJumpToDef && provider.canJumpToDef(editor)) {
                jumpToDefProvider = provider;
                return true;
            }

            return false;
        });

        if (jumpToDefProvider) {
            const request = jumpToDefProvider.doJumpToDef(editor);

            if (request) {
                request.done(function () {
                    result.resolve();
                }).fail(function () {
                    result.reject();
                });
            } else {
                result.reject();
            }
        } else {
            result.reject();
        }
    } else {
        result.reject();
    }

    return result.promise();
}

CommandManager.register(Strings.CMD_JUMPTO_DEFINITION, Commands.NAVIGATE_JUMPTO_DEFINITION, _doJumpToDef);
