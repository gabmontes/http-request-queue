define([
    'bower_components/eventemitter2/lib/eventemitter2',
    'strategies/sequentialPost'
], function (EventEmitter, sequentialPost) {
    'use strict';

    function mix(obj1, obj2) {
        for (var prop in obj2) {
            if (obj2.hasOwnProperty(prop)) {
                obj1[prop] = obj2[prop];
            }
        }
        return obj1;
    }

    function RequestQueue(request, Promise, options) {
        // options
        this.options = mix({
            strategy: sequentialPost,
            retryTimeout: 1000,
            maxRetries: 300,
            log: function () {}
        }, options);
        // references
        this._request = request;
        this._Promise = Promise;
        this._runner = this.options.strategy;
        // queue
        this._requestQueue = [];
        this._requestId = 0;
        // dispatcher
        this._dispatcher = new EventEmitter();
        // log
        this._log = this.options.log;
    }

    RequestQueue.prototype._removeFromQueue = function (id) {
        this._log('(' + id + ') removing request');
        // find the request
        var index = this._requestQueue.reduce(function (prev, req, index) {
            return req.id === id ? index : prev;
        }, -1);
        // remove it
        if (index !== -1) {
            this._requestQueue.splice(index, 1);
        }
        this._log('queue length ' + this._requestQueue.length);
        this._dispatcher.emit('queue-length-change', this._requestQueue.length);
        setTimeout(this._run.bind(this), 0);
    };
    RequestQueue.prototype._sendRequest = function (req) {
        var that = this;
        this._log('(' + req.id + ') sending ' + req.method + ' ' + req.url);
        switch (req.method) {
            case 'GET':
            case 'DELETE':
            case 'POST':
                req.status.pending = true;
                req.status.retry = false;
                var options = {
                    type: req.method,
                    url: req.url,
                    data: req.data || null,
                    success: function (err, data) {
                        that._log('(' + req.id + ') request successfull');
                        that._removeFromQueue(req.id);
                        req.callback(err, data);
                    },
                    error: function (err) {
                        that._log('(' + req.id + ') request returned with error');
                        // server (5xx) or network error, shall retry
                        if (!err) {
                            req.status.pending = false;
                            req.status.retry = true;
                            if (++req.retries <= that.options.maxRetries) {
                                setTimeout(that._run.bind(that), that.options.retryTimeout);
                                return;
                            }
                        }
                        // client (4xx) error or max retries, do not retry
                        that._removeFromQueue(req.id);
                        req.callback(err || new Error('Max retries reached'));
                    }
                };
                that._request(mix(req.options, options));
                break;
            default:
                // method not supported yet
                this._removeFromQueue(req.id);
                req.callback(new Error('Unknown request method'));
        }
    };

    RequestQueue.prototype._run = function () {
        var that = this;
        this._log('running on ' + this._requestQueue.length + ' items');
        this._runner(this._requestQueue, function (req) {
            that._sendRequest.call(that, req);
        });
    };

    RequestQueue.prototype._addToQueue = function (method, url, data, options, callback) {
        this._log('(' + this._requestId + ') adding ' + method + ' ' + url);
        this._requestQueue.push({
            id: this._requestId++,
            method: method,
            url: url,
            data: data || null,
            options: options || {},
            callback: callback || function () {},
            status: {
                sent: false,
                pending: false,
                retry: false
            },
            retries: 0
        });
        this._log('queue length ' + this._requestQueue.length);
        this._dispatcher.emit('queue-length-change', this._requestQueue.length);
        setTimeout(this._run.bind(this), 0);
    };

    RequestQueue.prototype.request = function (method, url, data, options) {
        var that = this;
        return new this._Promise(function (fulfill, reject) {
            that._addToQueue(method, url, data, options, function (err, data) {
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
        this._dispatcher.on('queue-length-change', callback);
    };

    RequestQueue.prototype.filter = function (method, url, test) {
        return this._requestQueue.filter(function (req) {
            return req.method === method && req.url === url && test(req.data);
        });
    };

    Object.defineProperty(RequestQueue.prototype, 'status', {
        get: function () {
            return {
                length: this._requestQueue.length
            };
        }
    });

    return RequestQueue;
});
