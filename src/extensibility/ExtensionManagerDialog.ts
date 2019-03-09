/*
 * Copyright (c) 2013 - 2017 Adobe Systems Incorporated. All rights reserved.
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

import * as _ from "thirdparty/lodash";
import * as Mustache from "thirdparty/mustache/mustache";
import * as Dialogs from "widgets/Dialogs";
import * as DefaultDialogs from "widgets/DefaultDialogs";
import * as FileSystem from "filesystem/FileSystem";
import * as FileUtils from "file/FileUtils";
import * as Package from "extensibility/Package";
import * as Strings from "strings";
import * as StringUtils from "utils/StringUtils";
import * as Commands from "command/Commands";
import * as CommandManager from "command/CommandManager";
import * as InstallExtensionDialog from "extensibility/InstallExtensionDialog";
import * as AppInit from "utils/AppInit";
import * as Async from "utils/Async";
import * as KeyEvent from "utils/KeyEvent";
import * as ExtensionManager from "extensibility/ExtensionManager";
import { ExtensionManagerView } from "extensibility/ExtensionManagerView";
import * as ExtensionManagerViewModel from "extensibility/ExtensionManagerViewModel";
import * as PreferencesManager from "preferences/PreferencesManager";
import File = require("filesystem/File");
import { DispatcherEvents } from "utils/EventDispatcher";

import * as dialogTemplate from "text!htmlContent/extension-manager-dialog.html";

// bootstrap tabs component
import "widgets/bootstrap-tab";

interface ExtensionDialog {
    dialog: string;
    title: string;
    message: string;
}

let _activeTabIndex;

function _stopEvent(event) {
    event.stopPropagation();
    event.preventDefault();
}

/**
 * @private
 * Triggers changes requested by the dialog UI.
 */
export function _performChanges() {
    // If an extension was removed or updated, prompt the user to quit Brackets.
    const hasRemovedExtensions    = ExtensionManager.hasExtensionsToRemove();
    const hasUpdatedExtensions    = ExtensionManager.hasExtensionsToUpdate();
    const hasDisabledExtensions   = ExtensionManager.hasExtensionsToDisable();
    if (!hasRemovedExtensions && !hasUpdatedExtensions && !hasDisabledExtensions) {
        return;
    }

    let buttonLabel = Strings.CHANGE_AND_RELOAD;
    if (hasRemovedExtensions && !hasUpdatedExtensions && !hasDisabledExtensions) {
        buttonLabel = Strings.REMOVE_AND_RELOAD;
    } else if (hasUpdatedExtensions && !hasRemovedExtensions && !hasDisabledExtensions) {
        buttonLabel = Strings.UPDATE_AND_RELOAD;
    } else if (hasDisabledExtensions && !hasRemovedExtensions && !hasUpdatedExtensions) {
        buttonLabel = Strings.DISABLE_AND_RELOAD;
    }

    const dlg = Dialogs.showModalDialog(
        DefaultDialogs.DIALOG_ID_CHANGE_EXTENSIONS,
        Strings.CHANGE_AND_RELOAD_TITLE,
        Strings.CHANGE_AND_RELOAD_MESSAGE,
        [
            {
                className : Dialogs.DIALOG_BTN_CLASS_NORMAL,
                id        : Dialogs.DIALOG_BTN_CANCEL,
                text      : Strings.CANCEL
            },
            {
                className : Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                id        : Dialogs.DIALOG_BTN_OK,
                text      : buttonLabel
            }
        ],
        false
    );
    const $dlg = dlg.getElement();

    $dlg.one("buttonClick", function (e, ...args: Array<any>) {
        const buttonId = args[0];
        if (buttonId === Dialogs.DIALOG_BTN_OK) {
            // Disable the dialog buttons so the user can't dismiss it,
            // and show a message indicating that we're doing the updates,
            // in case it takes a long time.
            $dlg.find(".dialog-button").prop("disabled", true);
            $dlg.find(".close").hide();
            $dlg.find(".dialog-message")
                .text(Strings.PROCESSING_EXTENSIONS)
                .append("<span class='spinner inline spin'/>");

            let removeErrors: Array<Async.Error>;
            let updateErrors: Array<Async.Error>;
            let disableErrors: Array<Async.Error>;

            const removeExtensionsPromise = ExtensionManager.removeMarkedExtensions()
                .fail(function (errorArray) {
                    removeErrors = errorArray;
                });
            const updateExtensionsPromise = ExtensionManager.updateExtensions()
                .fail(function (errorArray) {
                    updateErrors = errorArray;
                });
            const disableExtensionsPromise = ExtensionManager.disableMarkedExtensions()
                .fail(function (errorArray) {
                    disableErrors = errorArray;
                });

            Async.waitForAll([removeExtensionsPromise, updateExtensionsPromise, disableExtensionsPromise], true)
                .always(function () {
                    dlg.close();
                })
                .done(function () {
                    CommandManager.execute(Commands.APP_RELOAD);
                })
                .fail(function () {
                    const ids: Array<unknown> = [];
                    const dialogs: Array<ExtensionDialog> = [];

                    function nextDialog() {
                        const dialog = dialogs.shift();
                        if (dialog) {
                            Dialogs.showModalDialog(dialog.dialog, dialog.title, dialog.message)
                                .done(nextDialog);
                        } else {
                            // Even in case of error condition, we still have to reload
                            CommandManager.execute(Commands.APP_RELOAD);
                        }
                    }

                    if (removeErrors) {
                        removeErrors.forEach(function (errorObj) {
                            ids.push(errorObj.item);
                        });
                        dialogs.push({
                            dialog: DefaultDialogs.DIALOG_ID_ERROR,
                            title: Strings.EXTENSION_MANAGER_REMOVE,
                            message: StringUtils.format(Strings.EXTENSION_MANAGER_REMOVE_ERROR, ids.join(", "))
                        });
                    }

                    if (updateErrors) {
                        // This error case should be very uncommon.
                        // Just let the user know that we couldn't update
                        // this extension and log the errors to the console.
                        ids.length = 0;
                        updateErrors.forEach(function (errorObj) {
                            ids.push(errorObj.item);
                            if (errorObj.error && errorObj.error.forEach) {
                                console.error("Errors for", errorObj.item);
                                errorObj.error.forEach(function (error) {
                                    console.error(Package.formatError(error));
                                });
                            } else {
                                console.error("Error for", errorObj.item, errorObj);
                            }
                        });
                        dialogs.push({
                            dialog: DefaultDialogs.DIALOG_ID_ERROR,
                            title: Strings.EXTENSION_MANAGER_UPDATE,
                            message: StringUtils.format(Strings.EXTENSION_MANAGER_UPDATE_ERROR, ids.join(", "))
                        });
                    }

                    if (disableErrors) {
                        ids.length = 0;
                        disableErrors.forEach(function (errorObj) {
                            ids.push(errorObj.item);
                        });
                        dialogs.push({
                            dialog: DefaultDialogs.DIALOG_ID_ERROR,
                            title: Strings.EXTENSION_MANAGER_DISABLE,
                            message: StringUtils.format(Strings.EXTENSION_MANAGER_DISABLE_ERROR, ids.join(", "))
                        });
                    }

                    nextDialog();
                });
        } else {
            dlg.close();
            ExtensionManager.cleanupUpdates();
            ExtensionManager.unmarkAllForRemoval();
            ExtensionManager.unmarkAllForDisabling();
        }
    });
}


/**
 * @private
 * Install extensions from the local file system using the install dialog.
 * @return {$.Promise}
 */
function _installUsingDragAndDrop() {
    const installZips: Array<File> = [];
    const updateZips: Array<File> = [];
    const deferred = $.Deferred();

    brackets.app.getDroppedFiles(function (err, paths) {
        if (err) {
            // Only possible error is invalid params, silently ignore
            console.error(err);
            deferred.resolve();
            return;
        }

        // Parse zip files and separate new installs vs. updates
        const validatePromise = Async.doInParallel_aggregateErrors(paths, function (path) {
            const result = $.Deferred();

            FileSystem.resolve(path, function (err, file) {
                const extension = FileUtils.getFileExtension(path);
                const isZip = file.isFile && (extension === "zip");
                let errStr;

                if (err) {
                    errStr = FileUtils.getFileErrorString(err);
                } else if (!isZip) {
                    errStr = Strings.INVALID_ZIP_FILE;
                }

                if (errStr) {
                    result.reject(errStr);
                    return;
                }

                // Call validate() so that we open the local zip file and parse the
                // package.json. We need the name to detect if this zip will be a
                // new install or an update.
                Package.validate(path, { requirePackageJSON: true }).done(function (info) {
                    if (info.errors.length) {
                        result.reject(info.errors.map(Package.formatError).join(" "));
                        return;
                    }

                    const extensionName = info.metadata.name;
                    const extensionInfo = ExtensionManager.extensions[extensionName];
                    const isUpdate = extensionInfo && !!extensionInfo.installInfo;

                    if (isUpdate) {
                        updateZips.push(file);
                    } else {
                        installZips.push(file);
                    }

                    result.resolve();
                }).fail(function (err) {
                    result.reject(Package.formatError(err));
                });
            });

            return result.promise();
        });

        validatePromise.done(function () {
            const installPromise = Async.doSequentially(installZips, function (file) {
                return InstallExtensionDialog.installUsingDialog(file);
            });

            const updatePromise = installPromise.then(function () {
                return Async.doSequentially(updateZips, function (file) {
                    return InstallExtensionDialog.updateUsingDialog(file).done(function (result) {
                        ExtensionManager.updateFromDownload(result);
                    });
                });
            });

            // InstallExtensionDialog displays it's own errors, always
            // resolve the outer promise
            updatePromise.always(deferred.resolve);
        }).fail(function (errorArray) {
            deferred.reject(errorArray);
        });
    });

    return deferred.promise();
}

/**
 * @private
 * Show a dialog that allows the user to browse and manage extensions.
 */
function _showDialog() {
    const views: Array<ExtensionManagerView> = [];
    const context = { Strings: Strings, showRegistry: !!brackets.config.extension_registry };
    const models: Array<ExtensionManagerViewModel.ExtensionManagerViewModel> = [];

    // Load registry only if the registry URL exists
    if (context.showRegistry) {
        models.push(new ExtensionManagerViewModel.RegistryViewModel());
        models.push(new ExtensionManagerViewModel.ThemesViewModel());
    }

    models.push(new ExtensionManagerViewModel.InstalledViewModel());
    models.push(new ExtensionManagerViewModel.DefaultViewModel());

    function updateSearchDisabled() {
        const model           = models[_activeTabIndex];
        const searchDisabled  = ($search.val() === "") &&
                              (!model.filterSet || model.filterSet.length === 0);

        $search.prop("disabled", searchDisabled);
        $searchClear.prop("disabled", searchDisabled);

        return searchDisabled;
    }

    function clearSearch() {
        $search.val("");
        views.forEach(function (view, index) {
            view.filter("");
            $modalDlg.scrollTop(0);
        });

        if (!updateSearchDisabled()) {
            $search.focus();
        }
    }

    // Open the dialog
    const dialog = Dialogs.showModalDialogUsingTemplate(Mustache.render(dialogTemplate, context));

    // On dialog close: clean up listeners & models, and commit changes
    dialog.done(function () {
        $(window.document).off(".extensionManager");

        models.forEach(function (model) {
            model.dispose();
        });

        _performChanges();
    });

    // Create the view.
    const $dlg = dialog.getElement();
    const $search = $(".search", $dlg);
    const $searchClear = $(".search-clear", $dlg);
    const $modalDlg = $(".modal-body", $dlg);

    function setActiveTab($tab) {
        if (models[_activeTabIndex]) {
            models[_activeTabIndex].scrollPos = $modalDlg.scrollTop();
        }
        $tab.tab("show");
        if (models[_activeTabIndex]) {
            $modalDlg.scrollTop(models[_activeTabIndex].scrollPos || 0);
            clearSearch();
            if (_activeTabIndex === 2) {
                $(".ext-sort-group").hide();
            } else {
                $(".ext-sort-group").show();
            }
        }
    }

    // Dialog tabs
    $dlg.find(".nav-tabs a")
        .on("click", function (this: any, event) {
            setActiveTab($(this));
        });

    // Navigate through tabs via Ctrl-(Shift)-Tab
    // (focus may be on document.body if text in extension listing clicked - see #9511)
    $(window.document).on("keyup.extensionManager", function (event) {
        if (event.keyCode === KeyEvent.DOM_VK_TAB && event.ctrlKey) {
            const $tabs = $(".nav-tabs a", $dlg);
            let tabIndex = _activeTabIndex;

            if (event.shiftKey) {
                tabIndex--;
            } else {
                tabIndex++;
            }
            tabIndex %= $tabs.length;
            setActiveTab($tabs.eq(tabIndex));
        }
    });

    // Update & hide/show the notification overlay on a tab's icon, based on its model's notifyCount
    function updateNotificationIcon(index) {
        const model = models[index];
        const $notificationIcon = $dlg.find(".nav-tabs li").eq(index).find(".notification");
        if (model.notifyCount) {
            $notificationIcon.text(model.notifyCount);
            $notificationIcon.show();
        } else {
            $notificationIcon.hide();
        }
    }

    // Initialize models and create a view for each model
    const modelInitPromise = Async.doInParallel(models, function (model, index) {
        const view    = new ExtensionManagerView();
        const promise = view.initialize(model);
        let lastNotifyCount;

        promise.always(function () {
            views[index] = view;

            lastNotifyCount = model.notifyCount;
            updateNotificationIcon(index);
        });

        model.on("change", function () {
            if (lastNotifyCount !== model.notifyCount) {
                lastNotifyCount = model.notifyCount;
                updateNotificationIcon(index);
            }
        });

        return promise;
    }, true);

    modelInitPromise.always(function () {
        $(".spinner", $dlg).remove();

        views.forEach(function (view) {
            view.$el.appendTo($modalDlg);
        });

        // Update search UI before new tab is shown
        $("a[data-toggle='tab']", $dlg).each(function (index, tabElement) {
            $(tabElement).on("show", function (event) {
                _activeTabIndex = index;

                // Focus the search input
                if (!updateSearchDisabled()) {
                    $dlg.find(".search").focus();
                }
            });
        });

        // Filter the views when the user types in the search field.
        let searchTimeoutID;
        $dlg.on("input", ".search", function (this: any, e) {
            clearTimeout(searchTimeoutID);
            const query = $(this).val();
            searchTimeoutID = setTimeout(function () {
                views[_activeTabIndex].filter(query);
                $modalDlg.scrollTop(0);
            }, 200);
        }).on("click", ".search-clear", clearSearch);

        // Sort the extension list based on the current selected sorting criteria
        $dlg.on("change", ".sort-extensions", function (this: any, e) {
            const sortBy = $(this).val();
            PreferencesManager.set("extensions.sort", sortBy);
            models.forEach(function (model, index) {
                if (index <= 1) {
                    model._setSortedExtensionList(ExtensionManager.extensions, index === 1);
                    views[index].filter($(".search").val());
                }
            });
        });

        // Disable the search field when there are no items in the model
        models.forEach(function (model, index) {
            (model as unknown as DispatcherEvents).on("change", function () {
                if (_activeTabIndex === index) {
                    updateSearchDisabled();
                }
            });
        });

        const $activeTab = $dlg.find(".nav-tabs li.active a");
        if ($activeTab.length) { // If there's already a tab selected, show it
            $activeTab.parent().removeClass("active"); // workaround for bootstrap-tab
            $activeTab.tab("show");
        } else if ($("#toolbar-extension-manager").hasClass("updatesAvailable")) {
            // Open dialog to Installed tab if extension updates are available
            $dlg.find(".nav-tabs a.installed").tab("show");
        } else { // Otherwise show the first tab
            $dlg.find(".nav-tabs a:first").tab("show");
        }
        // If activeTab was explicitly selected by user,
        // then check for the selection
        // Or if there was an update available since activeTab.length would be 0,
        // then check for updatesAvailable class in toolbar-extension-manager
        if (($activeTab.length && $activeTab.hasClass("installed")) || (!$activeTab.length && $("#toolbar-extension-manager").hasClass("updatesAvailable"))) {
            $(".ext-sort-group").hide();
        } else {
            $(".ext-sort-group").show();
        }
    });

    // Handle the 'Install from URL' button.
    $(".extension-manager-dialog .install-from-url")
        .click(function () {
            InstallExtensionDialog.showDialog().done(ExtensionManager.updateFromDownload);
        });

    // Handle the drag/drop zone
    const $dropzone = $("#install-drop-zone");
    const $dropmask = $("#install-drop-zone-mask");

    $dropzone
        .on("dragover", function (event) {
            _stopEvent(event);

            const dataTransfer = (event.originalEvent as DragEvent).dataTransfer!;

            if (!dataTransfer.files) {
                return;
            }

            const items = dataTransfer.items;

            const isValidDrop = _.every(items, function (item) {
                if (item.kind === "file") {
                    const entry = item.webkitGetAsEntry();
                    const extension = FileUtils.getFileExtension(entry.fullPath);

                    return entry.isFile && extension === "zip";
                }

                return false;
            });

            if (isValidDrop) {
                // Set an absolute width to stabilize the button size
                $dropzone.width($dropzone.width());

                // Show drop styling and message
                $dropzone.removeClass("drag");
                $dropzone.addClass("drop");
            } else {
                dataTransfer.dropEffect = "none";
            }
        })
        .on("drop", _stopEvent);

    $dropmask
        .on("dragover", function (event) {
            _stopEvent(event);
            const dataTransfer = (event.originalEvent as DragEvent).dataTransfer!;
            dataTransfer.dropEffect = "copy";
        })
        .on("dragleave", function () {
            $dropzone.removeClass("drop");
            $dropzone.addClass("drag");
        })
        .on("drop", function (event) {
            _stopEvent(event);

            const dataTransfer = (event.originalEvent as DragEvent).dataTransfer!;
            if (dataTransfer.files) {
                // Attempt install
                _installUsingDragAndDrop().fail(function (errorArray) {
                    let message = Strings.INSTALL_EXTENSION_DROP_ERROR;

                    message += "<ul class='dialog-list'>";
                    errorArray.forEach(function (info) {
                        message += "<li><span class='dialog-filename'>";
                        message += StringUtils.breakableUrl(info.item);
                        message += "</span>: " + info.error + "</li>";
                    });
                    message += "</ul>";

                    Dialogs.showModalDialog(
                        DefaultDialogs.DIALOG_ID_ERROR,
                        Strings.EXTENSION_MANAGER_TITLE,
                        message
                    );
                }).always(function () {
                    $dropzone.removeClass("validating");
                    $dropzone.addClass("drag");
                });

                // While installing, show validating message
                $dropzone.removeClass("drop");
                $dropzone.addClass("validating");
            }
        });

    return $.Deferred().resolve(dialog).promise();
}

CommandManager.register(Strings.CMD_EXTENSION_MANAGER, Commands.FILE_EXTENSION_MANAGER, _showDialog);

AppInit.appReady(function () {
    $("#toolbar-extension-manager").click(_showDialog);
});