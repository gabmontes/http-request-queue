define([
    'bower_components/eventemitter2/lib/eventemitter2',
    'utils/nextTick'
], function (EventEmitter, nextTick) {
    'use strict';

    function RetryQueue(options) {
        this.seq = 0;
        this.queue = options.items || [];

        this.selectTasks = options.selectTasks;

        this.waitTime = options.waitTime || 1000;
        this.maxAttempts = options.maxAttempts || 50;

        this.dispatcher = new EventEmitter();
    }

    RetryQueue.prototype.add = function (data, run, callback) {
        var id = this.seq++;

        this.queue.push({
            id: id,
            item: data,
            tries: 0,
            running: false,
            selected: false,
            run: run,
            callback: callback
        });

        this.dispatcher.emit('queue-updated', {
            action: 'added',
            id: id,
            length: this.queue.length
        });

        nextTick(this.processItems.bind(this));
    };

    RetryQueue.prototype.processItems = function () {
        var that = this;

        this.selectTasks(this.queue.map(function (task) {
            return {
                data: task.item,
                running: task.running
            };
        })).forEach(function (selected, index) {
            that.queue[index].selected = selected;
        });

        this.queue.filter(function (task) {
            return task.selected;
        }).forEach(function (task) {
            task.selected = false;
            task.running = true;
            task.tries += 1;

            var item = task.item;
            task.run(item, function (result) {
                // success

                that.remove(task.id, true);
                nextTick(function () {
                    task.callback(null, result);
                });

            }, function () {
                // retry

                if (task.tries === that.maxAttempts) {

                    that.remove(task.id, false);
                    nextTick(function () {
                        task.callback(new Error('Max retries reached'));
                    });
                    return;
                }

                setTimeout(function () {

                    task.running = false;
                    that.processItems();

                }, that.waitTime);

            }, function (err, status) {
                // error

                that.remove(task.id, false);
                nextTick(function () {
                    task.callback(err || new Error('Unknown error'), status);
                });

            });
        });
    };

    RetryQueue.prototype.remove = function (id, success) {
        var index = this.queue.reduce(function (prev, task, index) {
            return task.id === id ? index : prev;
        }, -1);
        if (index === -1) {
            return;
        }

        this.queue.splice(index, 1);

        this.dispatcher.emit('queue-updated', {
            action: success ? 'processed' : 'failure',
            id: id,
            length: this.queue.length
        });

        nextTick(this.processItems.bind(this));
    };

    RetryQueue.prototype.onQueueUpdated = function (callback) {
        this.dispatcher.on('queue-updated', callback);
    };

    Object.defineProperty(RetryQueue.prototype, 'length', {
        get: function () {
            return this.queue.length;
        }
    });

    return RetryQueue;
});
