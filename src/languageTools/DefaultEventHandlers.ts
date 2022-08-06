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

import * as LanguageManager from "language/LanguageManager";
import * as ProjectManager from "project/ProjectManager";
import * as PathConverters from "languageTools/PathConverters";

export class EventPropagationProvider {
    private client;
    private previousProject;
    private currentProject;

    constructor(client) {
        this.client = client;
        this.previousProject = "";
        this.currentProject = ProjectManager.getProjectRoot();
    }

    private _sendDocumentOpenNotification(languageId, doc): void {
        if (!this.client) {
            return;
        }

        if (this.client._languages.includes(languageId)) {
            this.client.notifyTextDocumentOpened({
                languageId: languageId,
                filePath: (doc.file._path || doc.file.fullPath),
                fileContent: doc.getText()
            });
        }
    }

    public handleActiveEditorChange(event, current, previous): void {
        const self = this;

        if (!this.client) {
            return;
        }

        if (previous) {
            previous.document
                .off("languageChanged.language-tools");
            const previousLanguageId = LanguageManager.getLanguageForPath(previous.document.file.fullPath).getId();
            if (this.client._languages.includes(previousLanguageId)) {
                this.client.notifyTextDocumentClosed({
                    filePath: (previous.document.file._path || previous.document.file.fullPath)
                });
            }
        }
        if (current) {
            const currentLanguageId = LanguageManager.getLanguageForPath(current.document.file.fullPath).getId();
            current.document
                .on("languageChanged.language-tools", function () {
                    const languageId = LanguageManager.getLanguageForPath(current.document.file.fullPath).getId();
                    self._sendDocumentOpenNotification(languageId, current.document);
                });
            self._sendDocumentOpenNotification(currentLanguageId, current.document);
        }
    }

    public handleProjectOpen(event, directory): void {
        if (!this.client) {
            return;
        }

        this.currentProject = directory.fullPath;

        this.client.notifyProjectRootsChanged({
            foldersAdded: [this.currentProject],
            foldersRemoved: [this.previousProject]
        });
    }

    public handleProjectClose(event, directory): void {
        if (!this.client) {
            return;
        }

        this.previousProject = directory.fullPath;
    }

    public handleDocumentDirty(event, doc): void {
        if (!this.client) {
            return;
        }

        if (!doc.isDirty) {
            const docLanguageId = LanguageManager.getLanguageForPath(doc.file.fullPath).getId();
            if (this.client._languages.includes(docLanguageId)) {
                this.client.notifyTextDocumentSave({
                    filePath: (doc.file._path || doc.file.fullPath)
                });
            }
        }
    }

    public handleDocumentChange(event, doc, changeList): void {
        if (!this.client) {
            return;
        }

        const docLanguageId = LanguageManager.getLanguageForPath(doc.file.fullPath).getId();
        if (this.client._languages.includes(docLanguageId)) {
            this.client.notifyTextDocumentChanged({
                filePath: (doc.file._path || doc.file.fullPath),
                fileContent: doc.getText()
            });
        }
    }

    public handleDocumentRename(event, oldName, newName): void {
        if (!this.client) {
            return;
        }

        const oldDocLanguageId = LanguageManager.getLanguageForPath(oldName).getId();
        if (this.client._languages.includes(oldDocLanguageId)) {
            this.client.notifyTextDocumentClosed({
                filePath: oldName
            });
        }

        const newDocLanguageId = LanguageManager.getLanguageForPath(newName).getId();
        if (this.client._languages.includes(newDocLanguageId)) {
            this.client.notifyTextDocumentOpened({
                filePath: newName
            });
        }
    }

    public handleAppClose(event): void {
        // Also handles Reload with Extensions
        if (!this.client) {
            return;
        }

        this.client.stop();
    }

    public registerClientForEditorEvent(): void {
        if (this.client) {
            const handleActiveEditorChange = this.handleActiveEditorChange.bind(this);
            const handleProjectOpen = this.handleProjectOpen.bind(this);
            const handleProjectClose = this.handleProjectClose.bind(this);
            const handleDocumentDirty = this.handleDocumentDirty.bind(this);
            const handleDocumentChange = this.handleDocumentChange.bind(this);
            const handleDocumentRename = this.handleDocumentRename.bind(this);
            const handleAppClose = this.handleAppClose.bind(this);

            this.client.addOnEditorChangeHandler(handleActiveEditorChange);
            this.client.addOnProjectOpenHandler(handleProjectOpen);
            this.client.addBeforeProjectCloseHandler(handleProjectClose);
            this.client.addOnDocumentDirtyFlagChangeHandler(handleDocumentDirty);
            this.client.addOnDocumentChangeHandler(handleDocumentChange);
            this.client.addOnFileRenameHandler(handleDocumentRename);
            this.client.addBeforeAppClose(handleAppClose);
            this.client.onProjectFoldersRequest(handleProjectFoldersRequest);
        } else {
            console.log("No client provided for event propagation");
        }
    }
}

function handleProjectFoldersRequest(event) {
    const projectRoot = ProjectManager.getProjectRoot();
    let workspaceFolders = [projectRoot];

    workspaceFolders = PathConverters.convertToWorkspaceFolders(workspaceFolders);

    return $.Deferred().resolve(workspaceFolders);
}
