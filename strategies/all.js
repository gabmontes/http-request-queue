define(function () {
    'use strict';

    return function (tasks) {
        // process all new and retrying requests
        return tasks.map(function (task) {
            return !task.running;
        });
    };
});
