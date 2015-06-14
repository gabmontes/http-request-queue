define(function () {
    'use strict';

    return function (tasks) {
        // send all but posts
        var selected = tasks.map(function (task) {
            return task.data.method !== 'POST' && !task.running;
        });
        // and send first post only
        tasks.reduce(function (found, task, index) {
            if (found) {
                return true;
            }
            if (task.data.method === 'POST') {
                selected[index] = true;
                return true;
            }
            return false;
        }, false);
        return selected;
    };
});
