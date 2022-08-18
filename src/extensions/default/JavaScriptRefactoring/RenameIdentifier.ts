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

type TSession = any;

const EditorManager        = brackets.getModule("editor/EditorManager");
const ScopeManager         = brackets.getModule("JSUtils/ScopeManager");
const Session              = brackets.getModule("JSUtils/Session");
const MessageIds           = brackets.getModule("JSUtils/MessageIds");
const TokenUtils           = brackets.getModule("utils/TokenUtils");
const Strings              = brackets.getModule("strings");
const ProjectManager      = brackets.getModule("project/ProjectManager");

let session: TSession | null = null;  // object that encapsulates the current session state
const keywords = ["define", "alert", "exports", "require", "module", "arguments"];

// Create new session
function initializeSession(editor) {
    session = new Session(editor);
}

// Post message to tern node domain that will request tern server to find refs
function getRefs(fileInfo, offset) {
    ScopeManager.postMessage({
        type: MessageIds.TERN_REFS,
        fileInfo: fileInfo,
        offset: offset
    });

    return ScopeManager.addPendingRequest(fileInfo.name, offset, MessageIds.TERN_REFS);
}

// Create info required to find reference
function requestFindRefs(session, document, offset) {
    if (!document || !session) {
        return;
    }
    const path    = document.file.fullPath;
    const fileInfo = {
        type: MessageIds.TERN_FILE_INFO_TYPE_FULL,
        name: path,
        offsetLines: 0,
        text: ScopeManager.filterText(session.getJavascriptText())
    };
    const ternPromise = getRefs(fileInfo, offset);

    return {promise: ternPromise};
}

// Do rename of identifier which is at cursor
export function handleRename() {
    const editor = EditorManager.getActiveEditor();

    if (!editor) {
        return;
    }

    if (editor.getSelections().length > 1) {
        editor.displayErrorMessageAtCursor(Strings.ERROR_RENAME_MULTICURSOR);
        return;
    }
    initializeSession(editor);


    if (!editor || editor.getModeForSelection() !== "javascript") {
        return;
    }

    const token = TokenUtils.getTokenAt(editor._codeMirror, editor._codeMirror.posFromIndex(session!.getOffset()));

    if (keywords.indexOf(token.string) >= 0) {
        editor.displayErrorMessageAtCursor(Strings.ERROR_RENAME_GENERAL);
        return;
    }

    const result = $.Deferred();

    function isInSameFile(obj, refsResp) {
        const projectRoot = ProjectManager.getProjectRoot();
        let projectDir;
        let fileName = "";
        if (projectRoot) {
            projectDir = projectRoot.fullPath;
        }

        // get the relative path of File as Tern can also return
        // references with file name as a relative path wrt projectRoot
        // so refernce file name will be compared with both relative and absolute path to check if it is same file
        if (projectDir && refsResp && refsResp.file && refsResp.file.indexOf(projectDir) === 0) {
            fileName = refsResp.file.slice(projectDir.length);
        }
        // In case of unsaved files, After renameing once Tern is returning filename without forward slash
        return (obj && (obj.file === refsResp.file || obj.file === fileName ||
            obj.file === refsResp.file.slice(1, refsResp.file.length)));
    }

    /**
     * Check if references are in this file only
     * If yes then select all references
     */
    function handleFindRefs(refsResp) {
        if (!refsResp || !refsResp.references || !refsResp.references.refs) {
            return;
        }

        const inlineWidget = EditorManager.getFocusedInlineWidget();
        const editor = EditorManager.getActiveEditor()!;
        const refs = refsResp.references.refs;
        const type = refsResp.references.type;

        // In case of inline widget if some references are outside widget's text range then don't allow for rename
        if (inlineWidget) {
            const isInTextRange  = !refs.find(function (item) {
                return (item.start.line < inlineWidget._startLine || item.end.line > inlineWidget._endLine);
            });

            if (!isInTextRange) {
                editor.displayErrorMessageAtCursor(Strings.ERROR_RENAME_QUICKEDIT);
                return;
            }
        }

        const currentPosition = editor.posFromIndex(refsResp.offset);
        let refsArray = refs;
        if (type !== "local") {
            refsArray = refs.filter(function (element) {
                return isInSameFile(element, refsResp);
            });
        }

        // Finding the Primary Reference in Array
        const primaryRef = refsArray.find(function (element) {
            return ((element.start.line === currentPosition.line || element.end.line === currentPosition.line) &&
                currentPosition.ch <= element.end.ch && currentPosition.ch >= element.start.ch);
        });
        // Setting the primary flag of Primary Refence to true
        primaryRef.primary = true;

        editor.setSelections(refsArray);
    }

    /**
     * Make a find ref request.
     * @param {Session} session - the session
     * @param {number} offset - the offset of where to jump from
     */
    function requestFindReferences(session, offset) {
        const response = requestFindRefs(session, session.editor.document, offset);

        if (response && response.hasOwnProperty("promise")) {
            response.promise.done(handleFindRefs).fail(function () {
                result.reject();
            });
        }
    }

    const offset = session!.getOffset();
    requestFindReferences(session, offset);

    return result.promise();
}
