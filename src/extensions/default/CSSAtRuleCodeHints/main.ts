/*
 * Copyright (c) 2017 - 2017 Adobe Systems Incorporated. All rights reserved.
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

import type { CodeHintProvider } from "editor/CodeHintManager";

// Load dependent modules
const AppInit         = brackets.getModule("utils/AppInit");
const CodeHintManager = brackets.getModule("editor/CodeHintManager");
import * as AtRulesText from "text!AtRulesDef.json";
const AtRules         = JSON.parse(AtRulesText);

// For unit testing
export let restrictedBlockHints: AtRuleHints;

class AtRuleHints implements CodeHintProvider {
    private editor;
    private filter;
    private token;

    /**
     * @constructor
     */
    constructor() {
        // Do nothing.
    }

    // As we are only going to provide @rules name hints
    // we should claim that we don't have hints for anything else
    public hasHints(editor, implicitChar): boolean {
        const pos = editor.getCursorPos();
        const token = editor._codeMirror.getTokenAt(pos);
        let cmState;

        this.editor = editor;

        if (token.state.base && token.state.base.localState) {
            cmState = token.state.base.localState;
        } else {
            cmState = token.state.localState || token.state;
        }

        // Check if we are at '@' rule 'def' context
        if ((token.type === "def" && cmState.context.type === "at") ||
            (token.type === "variable-2" && (cmState.context.type === "top" || cmState.context.type === "block"))) {
            this.filter = token.string;
            return true;
        }

        this.filter = null;
        return false;
    }

    public getHints(implicitChar) {
        const pos     = this.editor.getCursorPos();
        const token   = this.editor._codeMirror.getTokenAt(pos);

        this.filter = token.string;
        this.token = token;

        if (!this.filter) {
            return null;
        }

        // Filter the property list based on the token string
        const result = Object.keys(AtRules).filter(function (key) {
            if (key.indexOf(token.string) === 0) {
                return key;
            }

            return undefined;
        }).sort();

        return {
            hints: result,
            match: this.filter,
            selectInitial: true,
            defaultDescriptionWidth: true,
            handleWideResults: false
        };
    }

    /**
     * Inserts a given @<rule> hint into the current editor context.
     *
     * @param {string} completion
     * The hint to be inserted into the editor context.
     *
     * @return {boolean}
     * Indicates whether the manager should follow hint insertion with an
     * additional explicit hint request.
     */
    public insertHint(completion): false {
        const cursor = this.editor.getCursorPos();
        this.editor.document.replaceRange(completion, {line: cursor.line, ch: this.token.start}, {line: cursor.line, ch: this.token.end});
        return false;
    }
}

AppInit.appReady(function () {
    // Register code hint providers
    restrictedBlockHints = new AtRuleHints();
    CodeHintManager.registerHintProvider(restrictedBlockHints, ["css", "less", "scss"], 0);
});
