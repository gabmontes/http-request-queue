define([
    'chai',
    'bower_components/bluebird/js/browser/bluebird',
    'index',
    'strategies/sequential',
    'strategies/all',
    'adapters/jquery-adapter'
], function (chai, Promise, HttpRequestQueue, sequentialRun, parallelRun, jqAdapter) {
    'use strict';

    var assert = chai.assert;

    function requestMock(resources) {
        return function (options) {
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
        };
    }

    suite('basic operations', function () {

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

        suiteSetup(function () {
            var mock = requestMock(resources);
            var options = {
                retryTimeout: 100,
                maxRetries: 5
            };
            queue = new HttpRequestQueue(mock, Promise, options);
        });

        test('created queue is empty', function () {
            assert.strictEqual(queue.length, 0);
        });

        test('make a GET', function (done) {
            var r = resources[0];
            queue.get(r.url).then(function (data) {
                assert.deepEqual(data, r.response);
                assert.strictEqual(queue.length, 0);
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
                assert.strictEqual(queue.length, 0);
                done();
            }).catch(done);
            assert.strictEqual(queue.length, 2);
        });

        test('make a POST', function (done) {
            var r = resources[3];
            queue.post(r.url, r.data).then(function (data) {
                assert.deepEqual(data, r.response);
                assert.strictEqual(queue.length, 0);
                done();
            }).catch(done);
        });

        test('retry a GET', function (done) {
            this.timeout(5000);
            var r = resources[4];
            queue.get(r.url).then(function (data) {
                assert.deepEqual(data, r.response);
                assert.strictEqual(queue.length, 0);
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
                assert.strictEqual(queue.length, 0);
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
                assert.strictEqual(queue.length, 0);
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
                assert.strictEqual(queue.length, 0);
                done();
            });
        });

        test('make a DELETE', function (done) {
            var r = resources[8];
            queue.delete(r.url).then(function () {
                assert.strictEqual(queue.length, 0);
                done();
            }).catch(done);
        });
    });

    suite('strategies', function () {

        var resources = [{
            url: 'mock.com/post-seq1',
            type: 'POST',
            data: {value: 'ps1'},
            status: 200,
            delay: 50,
            response: {data: 'value ps1'}
        }, {
            url: 'mock.com/post-seq2',
            type: 'POST',
            data: {value: 'ps2'},
            status: 200,
            delay: 20,
            response: {data: 'value ps2'}
        }, {
            url: 'mock.com/get-seq1',
            type: 'GET',
            status: 200,
            delay: 10,
            response: {data: 'value at gs1'}
        }];

        var queueParallel;
        var queueSequence;
        var queuePriority;

        suiteSetup(function () {
            var mock = requestMock(resources);
            var options = {
                retryTimeout: 100,
                maxRetries: 5
            };
            queuePriority = new HttpRequestQueue(mock, Promise, options);

            options.strategy = sequentialRun;
            queueSequence = new HttpRequestQueue(mock, Promise, options);

            options.strategy = parallelRun;
            queueParallel = new HttpRequestQueue(mock, Promise, options);
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
                assert.strictEqual(queuePriority.length, 1);
            }).catch(done);
            queuePriority.post(post2.url).then(function (data) {
                assert.isTrue(post1done);
                assert.isTrue(get1done);
                assert.strictEqual(data, post2.response);
                post2done = true;
                assert.strictEqual(queuePriority.length, 0);
                done();
            }).catch(done);
            queuePriority.get(get1.url).then(function (data) {
                assert.isFalse(post1done);
                assert.isFalse(post2done);
                assert.strictEqual(data, get1.response);
                get1done = true;
                assert.strictEqual(queuePriority.length, 2);
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
                assert.strictEqual(queueParallel.length, 0);
                done();
            }).catch(done);
            queueParallel.post(post2.url).then(function (data) {
                assert.isFalse(post1done);
                assert.isTrue(get1done);
                assert.strictEqual(data, post2.response);
                post2done = true;
                assert.strictEqual(queueParallel.length, 1);
            }).catch(done);
            queueParallel.get(get1.url).then(function (data) {
                assert.isFalse(post1done);
                assert.isFalse(post2done);
                assert.strictEqual(data, get1.response);
                get1done = true;
                assert.strictEqual(queueParallel.length, 2);
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
                assert.strictEqual(queueSequence.length, 2);
            }).catch(done);
            queueSequence.post(post2.url).then(function (data) {
                assert.isTrue(post1done);
                assert.isFalse(get1done);
                assert.strictEqual(data, post2.response);
                post2done = true;
                assert.strictEqual(queueSequence.length, 1);
            }).catch(done);
            queueSequence.get(get1.url).then(function (data) {
                assert.isTrue(post1done);
                assert.isTrue(post2done);
                assert.strictEqual(data, get1.response);
                get1done = true;
                assert.strictEqual(queueSequence.length, 0);
                done();
            }).catch(done);
        });
    });

    suite('events', function () {

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
        }];

        suiteSetup(function () {
            var mock = requestMock(resources);
            var options = {
                retryTimeout: 100,
                maxRetries: 5
            };
            queue = new HttpRequestQueue(mock, Promise, options);
        });

        test('queue length change', function (done) {
            var lengthSeq = [1, 2, 3, 2, 1, 0],
                seq = 0;
            queue.onQueueLengthChange(function (length) {
                assert.strictEqual(length, lengthSeq[seq++]);
                if (seq === lengthSeq.length) {
                    done();
                }
            });
            Promise.all(resources.map(function (r) {
                return queue.get(r.url);
            })).catch(function () {
                assert.fail();
            });
        });
    });

    suite('filter', function () {

        var queue;

        var resources = [{
            url: 'mock.com/1',
            type: 'GET',
            delay: 50,
            status: 200,
            response: {data: 'value at 1'}
        }, {
            url: 'mock.com/2',
            type: 'GET',
            delay: 25,
            status: 200,
            response: {data: 'value at 2'}
        }];

        suiteSetup(function () {
            var mock = requestMock(resources);
            var options = {
                retryTimeout: 100,
                maxRetries: 5
            };
            queue = new HttpRequestQueue(mock, Promise, options);
        });

        test('filter', function (done) {
            Promise.all([
                queue.get(resources[0].url).then(function () {
                    done();
                }),
                queue.get(resources[1].url).then(function () {
                    assert.strictEqual(queue.filter(function (req) {
                        return req.method === resources[0].type && req.url === resources[0].url;
                    }).length, 1);
                })
            ]).catch(function () {
                assert.fail();
            });
        });
    });

    suite('jQuery adapter', function () {

        var queue;

        var resources = [{
            url: 'https://avatars0.githubusercontent.com/u/2621975?v=3&s=460',
            type: 'GET',
        }, {
            url: 'http://this.page.does.not.exist.com/',
            type: 'GET'
        }];

        suiteSetup(function () {
            var options = {
                retryTimeout: 100,
                maxRetries: 5
            };
            queue = new HttpRequestQueue(jqAdapter, Promise, options);
        });

        test('GET a page', function (done) {
            var r = resources[0];
            queue.get(r.url).then(function () {
                assert.strictEqual(queue.length, 0);
                done();
            }).catch(done);
        });

        test('GET a page that does not exist', function (done) {
            var r = resources[1];
            queue.get(r.url).then(function () {
                assert.fail();
            }).catch(function (err) {
                assert.isObject(err);
                assert.strictEqual(err.message, 'Max retries reached');
                assert.strictEqual(queue.length, 0);
                done();
            });
        });
    });
});
