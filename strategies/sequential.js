define(function () {
    'use strict';

    return function (tasks) {
        // if first not pending, run it
        if (tasks[0] && !tasks[0].running) {
            return [true];
        }
        return [];
    };
});
