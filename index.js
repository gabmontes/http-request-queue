define([
    'retry-queue/index',
    'strategies/sequentialPost',
    'utils/mixProps'
], function (RetryQueue, sequentialPost, mixIn) {
    'use strict';

    function RequestQueue(request, Promise, options) {
        // utilities
        this._request = request;
        this._Promise = Promise;
        // queue
        this._requestQueue = new RetryQueue({
            // retry options
            waitTime: options.retryTimeout,
            maxAttempts: options.maxRetries,
            // strategy
            selectTasks: options.strategy || sequentialPost
        });
    }

    RequestQueue.prototype._sendRequest = function (req, successCb, retryCb, errorCb) {
        var that = this;
        switch (req.method) {
            case 'GET':
            case 'DELETE':
            case 'POST':
                var options = {
                    type: req.method,
                    url: req.url,
                    data: req.data || null,
                    success: function (err, data) {
                        successCb(data);
                    },
                    error: function (err, code) {
                        if (!err) {
                            // server (5xx) or network error, shall retry
                            retryCb();
                            return;
                        }
                        // client (4xx) error
                        errorCb(err, code);
                    }
                };
                that._request(mixIn(req.options, options));
                break;
            default:
                // method not supported yet
                errorCb(new Error('Unsupported request method'));
        }
    };

    RequestQueue.prototype.request = function (method, url, data, options) {
        var that = this;
        return new this._Promise(function (fulfill, reject) {
            that._requestQueue.add({
                method: method,
                url: url,
                data: data || null,
                options: options || {}
            }, that._sendRequest.bind(that), function (err, data) {
                if (err) {
                    reject(err);
                    return;
                }
                fulfill(data);
            });
        });
    };
    RequestQueue.prototype.get = function (url) {
        return this.request('GET', url);
    };
    RequestQueue.prototype.post = function (url, data) {
        return this.request('POST', url, data);
    };
    RequestQueue.prototype.delete = function (url) {
        return this.request('DELETE', url);
    };

    RequestQueue.prototype.onQueueLengthChange = function (callback) {
        this._requestQueue.onQueueUpdated(function (status){
            callback(status.length);
        });
    };

    RequestQueue.prototype.filter = function (test) {
        return this._requestQueue.queue.filter(test);
    };

    Object.defineProperty(RequestQueue.prototype, 'status', {
        get: function () {
            return {
                length: this._requestQueue.queue.length
            };
        }
    });

    return RequestQueue;
});
