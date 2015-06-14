define([
    'chai',
    'index',
    'strategies/sequential',
    'strategies/all',
    'bower_components/bluebird/js/browser/bluebird'
], function (chai, HttpRequestQueue, sequentialRun, parallelRun, Promise) {
    'use strict';

    var assert = chai.assert;

    suite('request queue with mock adapter', function () {

        var queue;

        var resources = [{
            url: 'mock.com/1',
            type: 'GET',
            delay: 0,
            status: 200,
            response: {data: 'value at 1'}
        }, {
            url: 'mock.com/2',
            type: 'GET',
            delay: 20,
            status: 200,
            response: {data: 'value at 2'}
        }, {
            url: 'mock.com/3',
            type: 'GET',
            delay: 30,
            status: 200,
            response: {data: 'value at 3'}
        }, {
            url: 'mock.com/post-1',
            type: 'POST',
            data: {value: 'p1'},
            delay: 20,
            status: 200,
            response: {data: 'value at p1'}
        }, {
            url: 'mock.com/500-1',
            type: 'GET',
            delay: 20,
            status: 500,
            tries: 3,
            tried: 0,
            response: {data: 'value at p1'}
        }, {
            url: 'mock.com/404-1',
            type: 'GET',
            delay: 20,
            status: 404
        }, {
            url: 'mock.com/retry-1',
            type: 'GET',
            delay: 20,
            tries: 6,
            tried: 0,
            status: 500
        }, {
            url: 'mock.com/bad-1',
            type: 'UNKNOWN'
        }, {
            url: 'mock.com/del-1',
            type: 'DELETE',
            delay: 20,
            status: 200
        }];

        function requestMock(options) {
            var resource = resources.filter(function (res) {
                return res.url === options.url;
            })[0];
            assert.strictEqual(options.type, resource.type);
            if (resource.request) {
                assert.deepEqual(options.data, resource.request);
            }
            setTimeout(function () {
                switch (resource.status) {
                    case 200:
                        options.success(null, resource.response);
                        break;
                    case 404:
                        options.error(new Error('client error'));
                        break;
                    case 500:
                        options.error(null, 500);
                        resource.tried += 1;
                        if (resource.tried === resource.tries) {
                            resource.status = 200;
                        }
                        break;
                }
            }, resource.delay);
        }

        test('create a queue', function () {
            var options = {
                retryTimeout: 100,
                maxRetries: 5,
                log: function (msg) {
                    console.log(msg);
                }
            };
            queue = new HttpRequestQueue(requestMock, Promise, options);
            assert.strictEqual(queue.status.length, 0);
        });

        test('make a GET', function (done) {
            var r = resources[0];
            queue.get(r.url).then(function (data) {
                assert.deepEqual(data, r.response);
                assert.strictEqual(queue.status.length, 0);
                done();
            }).catch(done);
        });

        test('make two GETs', function (done) {
            var r1 = resources[1];
            var r2 = resources[2];
            Promise.all([
                queue.get(r1.url),
                queue.get(r2.url)
            ]).then(function (data) {
                assert.deepEqual(data[0], r1.response);
                assert.deepEqual(data[1], r2.response);
                assert.strictEqual(queue.status.length, 0);
                done();
            }).catch(done);
            assert.strictEqual(queue.status.length, 2);
        });

        test('make a POST', function (done) {
            var r = resources[3];
            queue.post(r.url, r.data).then(function (data) {
                assert.deepEqual(data, r.response);
                assert.strictEqual(queue.status.length, 0);
                done();
            }).catch(done);
        });

        test('retry a GET', function (done) {
            this.timeout(5000);
            var r = resources[4];
            queue.get(r.url).then(function (data) {
                assert.deepEqual(data, r.response);
                assert.strictEqual(queue.status.length, 0);
                done();
            }).catch(done);
        });

        test('request a missing URL', function (done) {
            var r = resources[5];
            queue.get(r.url).then(function () {
                assert.fail();
            }).catch(function (err) {
                assert.isObject(err);
                assert.strictEqual(err.message, 'client error');
                assert.strictEqual(queue.status.length, 0);
                done();
            });
        });

        test('max retries limit reached', function (done) {
            var r = resources[6];
            queue.get(r.url).then(function () {
                assert.fail();
            }).catch(function (err) {
                assert.isObject(err);
                assert.strictEqual(err.message, 'Max retries reached');
                assert.strictEqual(queue.status.length, 0);
                done();
            });
        });

        test('bad HTTP method', function (done) {
            var r = resources[7];
            queue.request(r.method, r.url).then(function () {
                assert.fail();
            }).catch(function (err) {
                assert.isObject(err);
                assert.strictEqual(err.message, 'Unsupported request method');
                assert.strictEqual(queue.status.length, 0);
                done();
            });
        });

        test('make a DELETE', function (done) {
            var r = resources[8];
            queue.delete(r.url).then(function () {
                assert.strictEqual(queue.status.length, 0);
                done();
            }).catch(done);
        });
    });

    suite('request strategies', function () {

        var resources = [{
            url: 'mock.com/post-seq1',
            type: 'POST',
            data: {value: 'ps1'},
            delay: 50,
            response: {data: 'value ps1'}
        }, {
            url: 'mock.com/post-seq2',
            type: 'POST',
            data: {value: 'ps2'},
            delay: 20,
            response: {data: 'value ps2'}
        }, {
            url: 'mock.com/get-seq1',
            type: 'GET',
            delay: 10,
            response: {data: 'value at gs1'}
        }];

        function requestMock(options) {
            var resource = resources.filter(function (res) {
                return res.url === options.url;
            })[0];
            assert.strictEqual(options.type, resource.type);
            if (resource.request) {
                assert.deepEqual(options.data, resource.request);
            }
            setTimeout(function () {
                options.success(null, resource.response);
            }, resource.delay);
        }

        var queueParallel;
        var queueSequence;
        var queuePriority;

        test('create queues', function () {
            var options = {
                retryTimeout: 100,
                maxRetries: 5
            };
            queuePriority = new HttpRequestQueue(requestMock, Promise, options);

            options.strategy = sequentialRun;
            queueSequence = new HttpRequestQueue(requestMock, Promise, options);

            options.strategy = parallelRun;
            queueParallel = new HttpRequestQueue(requestMock, Promise, options);
        });

        test('make all GETs and then POSTs in sequence', function (done) {
            var post1done = false;
            var post2done = false;
            var get1done = false;
            var post1 = resources[0];
            var post2 = resources[1];
            var get1 = resources[2];
            queuePriority.post(post1.url).then(function (data) {
                assert.isFalse(post2done);
                assert.isTrue(get1done);
                assert.strictEqual(data, post1.response);
                post1done = true;
                assert.strictEqual(queuePriority.status.length, 1);
            }).catch(done);
            queuePriority.post(post2.url).then(function (data) {
                assert.isTrue(post1done);
                assert.isTrue(get1done);
                assert.strictEqual(data, post2.response);
                post2done = true;
                assert.strictEqual(queuePriority.status.length, 0);
                done();
            }).catch(done);
            queuePriority.get(get1.url).then(function (data) {
                assert.isFalse(post1done);
                assert.isFalse(post2done);
                assert.strictEqual(data, get1.response);
                get1done = true;
                assert.strictEqual(queuePriority.status.length, 2);
            }).catch(done);
        });

        test('make all requests in parallel', function (done) {
            var post1done = false;
            var post2done = false;
            var get1done = false;
            var post1 = resources[0];
            var post2 = resources[1];
            var get1 = resources[2];
            queueParallel.post(post1.url).then(function (data) {
                assert.isTrue(post2done);
                assert.isTrue(get1done);
                assert.strictEqual(data, post1.response);
                post1done = true;
                assert.strictEqual(queueParallel.status.length, 0);
                done();
            }).catch(done);
            queueParallel.post(post2.url).then(function (data) {
                assert.isFalse(post1done);
                assert.isTrue(get1done);
                assert.strictEqual(data, post2.response);
                post2done = true;
                assert.strictEqual(queueParallel.status.length, 1);
            }).catch(done);
            queueParallel.get(get1.url).then(function (data) {
                assert.isFalse(post1done);
                assert.isFalse(post2done);
                assert.strictEqual(data, get1.response);
                get1done = true;
                assert.strictEqual(queueParallel.status.length, 2);
            }).catch(done);
        });

        test('make all requests in sequence', function (done) {
            var post1done = false;
            var post2done = false;
            var get1done = false;
            var post1 = resources[0];
            var post2 = resources[1];
            var get1 = resources[2];
            queueSequence.post(post1.url).then(function (data) {
                assert.isFalse(post2done);
                assert.isFalse(get1done);
                assert.strictEqual(data, post1.response);
                post1done = true;
                assert.strictEqual(queueSequence.status.length, 2);
            }).catch(done);
            queueSequence.post(post2.url).then(function (data) {
                assert.isTrue(post1done);
                assert.isFalse(get1done);
                assert.strictEqual(data, post2.response);
                post2done = true;
                assert.strictEqual(queueSequence.status.length, 1);
            }).catch(done);
            queueSequence.get(get1.url).then(function (data) {
                assert.isTrue(post1done);
                assert.isTrue(post2done);
                assert.strictEqual(data, get1.response);
                get1done = true;
                assert.strictEqual(queueSequence.status.length, 0);
                done();
            }).catch(done);
        });
    });

    // test onQueueLengthChange event
    // test filter
    // test jQuery adapter
});
