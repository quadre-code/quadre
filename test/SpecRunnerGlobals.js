/**
 * Utility for tests that wait on a Promise to complete. Placed in the global namespace so it can be used
 * similarly to the standard Jasmine waitsFor(). Unlike waitsFor(), must be called from INSIDE
 * the runs() that generates the promise.
 * @param {$.Promise} promise
 * @param {string} operationName  Name used for timeout error message
 */
window.waitsForDone = function (promise, operationName, timeout) {
    timeout = timeout || 1000;
    expect(promise).toBeTruthy();
    promise.fail(function (err) {
        expect("[" + operationName + "] promise rejected with: " + err).toBe("(expected resolved instead)");
    });
    waitsFor(function () {
        return promise.state() === "resolved";
    }, "success [" + operationName + "]", timeout);
};

/**
 * Utility for tests that waits on a Promise to fail. Placed in the global namespace so it can be used
 * similarly to the standards Jasmine waitsFor(). Unlike waitsFor(), must be called from INSIDE
 * the runs() that generates the promise.
 * @param {$.Promise} promise
 * @param {string} operationName  Name used for timeout error message
 */
window.waitsForFail = function (promise, operationName, timeout) {
    timeout = timeout || 1000;
    expect(promise).toBeTruthy();
    promise.done(function (result) {
        expect("[" + operationName + "] promise resolved with: " + result).toBe("(expected rejected instead)");
    });
    waitsFor(function () {
        return promise.state() === "rejected";
    }, "failure " + operationName, timeout);
};
