/*
 * Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

const ScopeManager = brackets.getModule("JSUtils/ScopeManager");
const OVERWRITE_EXISTING_HINT = false;

export class JSParameterHintsProvider {
    private hintState;
    private hintStack;
    private preserveHintStack;
    private session;

    constructor() {
        this.hintState = {};
        this.hintStack = [];
        this.preserveHintStack = null; // close a function hint without clearing stack
        this.session = null; // current editor session, updated by main
    }

    /**
     * Update the current session for use by the Function Hint Manager.
     *
     * @param {Session} value - current session.
     */
    public setSession(value) {
        this.session = value;
    }

    /**
     * Test if a function hint is being displayed.
     *
     * @return {boolean} - true if a function hint is being displayed, false
     * otherwise.
     */
    public isHintDisplayed() {
        return this.hintState.visible === true;
    }

    /**
     * Save the state of the current hint. Called when popping up a parameter hint
     * for a parameter, when the parameter already part of an existing parameter
     * hint.
     */
    public pushHintOnStack() {
        this.hintStack.push(this.hintState);
    }

    /**
     * Restore the state of the previous function hint.
     *
     * @return {boolean} - true the a parameter hint has been popped, false otherwise.
     */
    public popHintFromStack() {
        if (this.hintStack.length > 0) {
            this.hintState = this.hintStack.pop();
            this.hintState.visible = false;
            return true;
        }

        return false;
    }

    /**
     * Reset the function hint stack.
     */
    public clearFunctionHintStack() {
        this.hintStack = [];
    }

    /**
     * Test if the function call at the cursor is different from the currently displayed
     * function hint.
     *
     * @param {{line:number, ch:number}} functionCallPos - the offset of the function call.
     * @return {boolean}
     */
    public hasFunctionCallPosChanged(functionCallPos) {
        const oldFunctionCallPos = this.hintState.functionCallPos;
        return (oldFunctionCallPos === undefined ||
            oldFunctionCallPos.line !== functionCallPos.line ||
            oldFunctionCallPos.ch !== functionCallPos.ch);
    }

    /**
     * Dismiss the function hint.
     *
     */
    public cleanHintState() {
        if (this.hintState.visible) {
            if (!this.preserveHintStack) {
                this.clearFunctionHintStack();
            }
        }
    }

    /**
     * Pop up a function hint on the line above the caret position.
     *
     * @param {boolean=} pushExistingHint - if true, push the existing hint on the stack. Default is false, not
     * to push the hint.
     * @param {string=} hint - function hint string from tern.
     * @param {{inFunctionCall: boolean, functionCallPos:
     * {line: number, ch: number}}=} functionInfo -
     * if the functionInfo is already known, it can be passed in to avoid
     * figuring it out again.
     * @return {jQuery.Promise} - The promise will not complete until the
     *      hint has completed. Returns null, if the function hint is already
     *      displayed or there is no function hint at the cursor.
     *
     */
    private _getParameterHint(pushExistingHint?, hint?, functionInfo?) {
        const result = $.Deferred();
        functionInfo = functionInfo || this.session.getFunctionInfo();
        if (!functionInfo.inFunctionCall) {
            this.cleanHintState();
            return result.reject(null);
        }

        if (this.hasFunctionCallPosChanged(functionInfo.functionCallPos)) {
            const pushHint = pushExistingHint && this.isHintDisplayed();
            if (pushHint) {
                this.pushHintOnStack();
                this.preserveHintStack = true;
            }

            this.cleanHintState();
            this.preserveHintStack = false;
        } else if (this.isHintDisplayed()) {
            return result.reject(null);
        }

        this.hintState.functionCallPos = functionInfo.functionCallPos;

        let request;
        if (!hint) {
            request = ScopeManager.requestParameterHint(this.session, functionInfo.functionCallPos);
        } else {
            this.session.setFnType(hint);
            request = $.Deferred();
            request.resolveWith(null, [hint]);
        }

        const self = this;
        request.done(function (fnType) {
            const hints = self.session.getParameterHint(functionInfo.functionCallPos);
            hints.functionCallPos = functionInfo.functionCallPos;
            result.resolve(hints);
        }).fail(function () {
            self.hintState = {};
            result.reject(null);
        });

        return result;
    }

    public hasParameterHints() {
        const functionInfo = this.session.getFunctionInfo();

        return functionInfo.inFunctionCall;
    }

    public getParameterHints(explicit, onCursorActivity) {
        const functionInfo = this.session.getFunctionInfo();

        if (!onCursorActivity) {
            if (functionInfo.inFunctionCall) {
                const token = this.session.getToken();

                if ((token && token.string === "(") || explicit) {
                    return this._getParameterHint();
                }
            } else {
                this.cleanHintState();
            }

            return $.Deferred().reject(null);
        }

        if (!functionInfo.inFunctionCall) {
            this.cleanHintState();
            return $.Deferred().reject(null);
        }

        // If in a different function hint, then dismiss the old one and
        // display the new one if there is one on the stack
        if (this.hasFunctionCallPosChanged(functionInfo.functionCallPos)) {
            if (this.popHintFromStack()) {
                const poppedFunctionCallPos = this.hintState.functionCallPos;
                const currentFunctionCallPos = functionInfo.functionCallPos;

                if (poppedFunctionCallPos.line === currentFunctionCallPos.line &&
                        poppedFunctionCallPos.ch === currentFunctionCallPos.ch) {
                    this.preserveHintStack = true;
                    const result = this._getParameterHint(OVERWRITE_EXISTING_HINT,
                        this.hintState.fnType, functionInfo);
                    this.preserveHintStack = false;
                    return result;
                }
            } else {
                this.cleanHintState();
            }
        }

        const hints = this.session.getParameterHint(functionInfo.functionCallPos);
        hints.functionCallPos = functionInfo.functionCallPos;
        return $.Deferred().resolve(hints);
    }
}
