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

export class BracketsToNodeInterface {
    private domain;
    private bracketsFn;

    constructor(domain) {
        this.domain = domain;
        this.bracketsFn = {};

        this._registerDataEvent();
    }

    private _messageHandler(evt, params): void {
        const methodName = params.method;
        const self = this;

        function _getErrorString(err) {
            if (typeof err === "string") {
                return err;
            }

            if (err && err.name && err.name === "Error") {
                return err.message;
            }

            return "Error in executing " + methodName;

        }

        function _sendResponse(response) {
            const responseParams = {
                requestId: params.requestId,
                params: response
            };
            self.domain.exec("response", responseParams);
        }

        function _sendError(err) {
            const responseParams = {
                requestId: params.requestId,
                error: _getErrorString(err)
            };
            self.domain.exec("response", responseParams);
        }

        if (self.bracketsFn[methodName]) {
            const method = self.bracketsFn[methodName];
            try {
                const response = method.call(null, params.params);
                if (params.respond && params.requestId) {
                    if (response.promise) {
                        response.done(function (result) {
                            _sendResponse(result);
                        }).fail(function (err) {
                            _sendError(err);
                        });
                    } else {
                        _sendResponse(response);
                    }
                }
            } catch (err) {
                if (params.respond && params.requestId) {
                    _sendError(err);
                }
            }
        }
    }

    public _registerDataEvent(): void {
        this.domain.on("data", this._messageHandler.bind(this));
    }

    public createInterface(methodName, isAsync) {
        const self = this;
        return function (params) {
            const execEvent = isAsync ? "asyncData" : "data";
            const callObject = {
                method: methodName,
                params: params
            };
            return self.domain.exec(execEvent, callObject);
        };
    }

    public registerMethod(methodName, methodHandle): void {
        if (methodName && methodHandle &&
            typeof methodName === "string" && typeof methodHandle === "function") {
            this.bracketsFn[methodName] = methodHandle;
        }
    }

    public registerMethods(methodList): void {
        const self = this;
        methodList.forEach(function (methodObj) {
            self.registerMethod(methodObj.methodName, methodObj.methodHandle);
        });
    }
}
