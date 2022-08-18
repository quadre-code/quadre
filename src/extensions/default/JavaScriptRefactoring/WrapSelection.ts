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

const _ = brackets.getModule("thirdparty/lodash");

const EditorManager        = brackets.getModule("editor/EditorManager");
const TokenUtils           = brackets.getModule("utils/TokenUtils");
const Strings              = brackets.getModule("strings");
import * as RefactoringUtils from "RefactoringUtils";
const RefactoringSession   = RefactoringUtils.RefactoringSession;

// Template keys mentioned in Templates.json
const WRAP_IN_CONDITION       = "wrapCondition";
const ARROW_FUNCTION          = "arrowFunction";
const GETTERS_SETTERS         = "gettersSetters";
const TRY_CATCH               = "tryCatch";

// Active session which will contain information about editor, selection etc
let current: RefactoringUtils.RefactoringSession;

/**
 * Initialize session
 */
function initializeRefactoringSession(editor) {
    current = new RefactoringSession(editor);
}

/**
 * Wrap selected statements
 *
 * @param {string} wrapperName - template name where we want wrap selected statements
 * @param {string} err- error message if we can't wrap selected code
 */
function _wrapSelectedStatements(wrapperName, err) {
    const editor = EditorManager.getActiveEditor();
    if (!editor) {
        return;
    }
    initializeRefactoringSession(editor);

    let startIndex = current.startIndex;
    let endIndex = current.endIndex;
    let selectedText = current.selectedText;

    if (selectedText.length === 0) {
        const statementNode = RefactoringUtils.findSurroundASTNode(current.ast, {start: startIndex}, ["Statement"]);
        if (!statementNode) {
            current.editor.displayErrorMessageAtCursor(err);
            return;
        }
        selectedText = current.text.substr(statementNode.start, statementNode.end - statementNode.start);
        startIndex = statementNode.start;
        endIndex = statementNode.end;
    } else {
        const selectionDetails = RefactoringUtils.normalizeText(selectedText, startIndex, endIndex);
        selectedText = selectionDetails.text;
        startIndex = selectionDetails.start;
        endIndex = selectionDetails.end;
    }

    if (!RefactoringUtils.checkStatement(current.ast, startIndex, endIndex, selectedText)) {
        current.editor.displayErrorMessageAtCursor(err);
        return;
    }

    const pos = {
        "start": current.cm.posFromIndex(startIndex),
        "end": current.cm.posFromIndex(endIndex)
    };

    current.document.batchOperation(function () {
        current.replaceTextFromTemplate(wrapperName, {body: selectedText}, pos);
    });

    if (wrapperName === TRY_CATCH) {
        const cursorLine = current.editor.getSelection().end.line - 1;
        const startCursorCh = current.document.getLine(cursorLine).indexOf("//");
        const endCursorCh = current.document.getLine(cursorLine).length;

        current.editor.setSelection({"line": cursorLine, "ch": startCursorCh}, {"line": cursorLine, "ch": endCursorCh});
    } else if (wrapperName === WRAP_IN_CONDITION) {
        current.editor.setSelection({"line": pos.start.line, "ch": pos.start.ch + 4}, {"line": pos.start.line, "ch": pos.start.ch + 13});
    }
}


// Wrap selected statements in try catch block
export function wrapInTryCatch() {
    _wrapSelectedStatements(TRY_CATCH, Strings.ERROR_TRY_CATCH);
}

// Wrap selected statements in try condition
export function wrapInCondition() {
    _wrapSelectedStatements(WRAP_IN_CONDITION, Strings.ERROR_WRAP_IN_CONDITION);
}

// Convert function to arrow function
export function convertToArrowFunction() {
    const editor = EditorManager.getActiveEditor();
    if (!editor) {
        return;
    }
    initializeRefactoringSession(editor);

    const funcExprNode = RefactoringUtils.findSurroundASTNode(current.ast, {start: current.startIndex}, ["Function"]);

    if (!funcExprNode || funcExprNode.type !== "FunctionExpression" || funcExprNode.id) {
        current.editor.displayErrorMessageAtCursor(Strings.ERROR_ARROW_FUNCTION);
        return;
    }

    if (funcExprNode === "FunctionDeclaration") {
        current.editor.displayErrorMessageAtCursor(Strings.ERROR_ARROW_FUNCTION);
        return;
    }

    if (!funcExprNode.body) {
        return;
    }

    const noOfStatements = funcExprNode.body.body.length;
    const param: Array<string> = [];
    let dontChangeParam = false;
    const numberOfParams = funcExprNode.params.length;
    let treatAsManyParam = false;

    funcExprNode.params.forEach(function (item) {
        if (item.type === "Identifier") {
            param.push(item.name);
        } else if (item.type === "AssignmentPattern") {
            dontChangeParam = true;
        }
    });

    // In case defaults params keep params as it is
    if (dontChangeParam) {
        if (numberOfParams >= 1) {
            param.splice(0, param.length);
            param.push(current.text.substr(funcExprNode.params[0].start, funcExprNode.params[numberOfParams - 1].end - funcExprNode.params[0].start));
            // In case default param, treat them as many paramater because to use
            // one parameter template, That param should be an identifier
            if (numberOfParams === 1) {
                treatAsManyParam = true;
            }
        }
        dontChangeParam = false;
    }

    const loc = {
        "fullFunctionScope": {
            start: funcExprNode.start,
            end: funcExprNode.end
        },
        "functionsDeclOnly": {
            start: funcExprNode.start,
            end: funcExprNode.body.start
        }
    };
    const locPos = {
        "fullFunctionScope": {
            "start": current.cm.posFromIndex(loc.fullFunctionScope.start),
            "end": current.cm.posFromIndex(loc.fullFunctionScope.end)
        },
        "functionsDeclOnly": {
            "start": current.cm.posFromIndex(loc.functionsDeclOnly.start),
            "end": current.cm.posFromIndex(loc.functionsDeclOnly.end)
        }
    };
    const isReturnStatement = (noOfStatements >= 1 && funcExprNode.body.body[0].type === "ReturnStatement");
    let bodyStatements = funcExprNode.body.body[0];

    // If there is nothing in function body, then get the text b/w curly braces
    // In this case, We will update params only as per Arrow function expression
    if (!bodyStatements) {
        bodyStatements = funcExprNode.body;
    }
    const params = {
        "params": param.join(", "),
        "statement": _.trimRight(current.text.substr(bodyStatements.start, bodyStatements.end - bodyStatements.start), ";")
    };

    if (isReturnStatement) {
        params.statement = params.statement.substr(7).trim();
    }

    if (noOfStatements === 1) {
        current.document.batchOperation(function () {
            (numberOfParams === 1 && !treatAsManyParam)
                ? current.replaceTextFromTemplate(ARROW_FUNCTION, params, locPos.fullFunctionScope, "oneParamOneStament")
                : current.replaceTextFromTemplate(ARROW_FUNCTION, params, locPos.fullFunctionScope, "manyParamOneStament");
        });
    } else {
        current.document.batchOperation(function () {
            (numberOfParams === 1 && !treatAsManyParam)
                ? current.replaceTextFromTemplate(ARROW_FUNCTION, {params: param},
                    locPos.functionsDeclOnly, "oneParamManyStament")
                : current.replaceTextFromTemplate(ARROW_FUNCTION, {params: param.join(", ")}, locPos.functionsDeclOnly, "manyParamManyStament");
        });
    }

    current.editor.setCursorPos(locPos.functionsDeclOnly.end.line, locPos.functionsDeclOnly.end.ch, false);
}

// Create gtteres and setters for a property
export function createGettersAndSetters() {
    const editor = EditorManager.getActiveEditor();
    if (!editor) {
        return;
    }
    initializeRefactoringSession(editor);

    let startIndex = current.startIndex;
    let endIndex = current.endIndex;
    let selectedText = current.selectedText;

    if (selectedText.length >= 1) {
        const selectionDetails = RefactoringUtils.normalizeText(selectedText, startIndex, endIndex);
        selectedText = selectionDetails.text;
        startIndex = selectionDetails.start;
        endIndex = selectionDetails.end;
    }

    const token = TokenUtils.getTokenAt(current.cm, current.cm.posFromIndex(endIndex));
    let commaString = ",";
    let propertyEndPos;

    // Create getters and setters only if selected reference is a property
    if (token.type !== "property") {
        current.editor.displayErrorMessageAtCursor(Strings.ERROR_GETTERS_SETTERS);
        return;
    }

    const parentNode = current.getParentNode(current.ast, endIndex);
    // Check if selected propery is child of a object expression
    if (!parentNode || !parentNode.properties) {
        current.editor.displayErrorMessageAtCursor(Strings.ERROR_GETTERS_SETTERS);
        return;
    }


    const propertyNodeArray = parentNode.properties;
    // Find the last Propery Node before endIndex
    const properyNodeIndex = propertyNodeArray.findIndex(function (element) {
        return (endIndex >= element.start && endIndex < element.end);
    });

    const propertyNode = propertyNodeArray[properyNodeIndex];

    // Get Current Selected Property End Index;
    propertyEndPos = editor.posFromIndex(propertyNode.end);


    // We have to add ',' so we need to find position of current property selected
    const isLastNode = current.isLastNodeInScope(current.ast, endIndex);
    let nextPropertNode;
    let nextPropertyStartPos;
    if (!isLastNode && properyNodeIndex + 1 <= propertyNodeArray.length - 1) {
        nextPropertNode = propertyNodeArray[properyNodeIndex + 1];
        nextPropertyStartPos = editor.posFromIndex(nextPropertNode.start);

        if (propertyEndPos.line !== nextPropertyStartPos.line) {
            propertyEndPos = current.lineEndPosition(current.startPos.line);
        } else {
            propertyEndPos = nextPropertyStartPos;
            commaString = ", ";
        }
    }

    let getSetPos;
    if (isLastNode) {
        getSetPos = current.document.adjustPosForChange(
            propertyEndPos, commaString.split("\n"),
            propertyEndPos, propertyEndPos);
    } else {
        getSetPos = propertyEndPos;
    }
    const templateParams = {
        "getName": token.string,
        "setName": token.string,
        "tokenName": token.string
    };

    // Replace, setSelection, IndentLine
    // We need to call batchOperation as indentLine don't have option to add origin as like replaceRange
    current.document.batchOperation(function () {
        if (isLastNode) {
            // Add ',' in the end of current line
            current.document.replaceRange(commaString, propertyEndPos, propertyEndPos);
        }

        current.editor.setSelection(getSetPos); // Selection on line end

        // Add getters and setters for given token using template at current cursor position
        current.replaceTextFromTemplate(GETTERS_SETTERS, templateParams);

        if (!isLastNode) {
            // Add ',' at the end setter
            current.document.replaceRange(commaString, current.editor.getSelection().start, current.editor.getSelection().start);
        }
    });
}
