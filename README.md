# HTTP Request Queue

A module to manage HTTP requests and retry on error

## Overview

When building complex web applications that interacts heavily with web services, ensuring the HTTP requests are tolerant to network or server issues or even out-of-sequence responses is a priority. Therefore, a package that is responsible of managing all requests simplifies the building of such web applications.

The `http-request-queue` is implemented as a queue that executes the requests using a specific strategy and, if there are network or server issues, it retries the request automatically. The main features are:

- Queues requests and a callback that is called when the request is done.
- Retries all network and server issues (HTTP 5xx-code errors) and fails on max retries or client issues (HTTP 4xx-code errors).
- Execute the queue requests all in parallel, in sequence or sequencing only the POST. It even accepts custom execution strategies.
- Multiple queues can be created using different strategies, options, and other settings.

An implementation of Promise such as [Bluebird](https://github.com/petkaantonov/bluebird) has to be provided to create queues. Additionally, a method to execute the HTTP requests have to be provided too. If using [jQuery.ajax()](http://api.jquery.com/jquery.ajax/), an adapter is already provided.

## Basic usage

The package is provided as a Bower component. So, it shall be installed using the command:

```bash
bower install http-request-queue
```

In order to create a queue, require the package using an AMD loader provide both an implementation of Promise and an object to actually handle the requests:

```javascript
require([
    'bower_components/http-request-queue/index',
    'bower_components/http-request-queue/adapters/jquery-adapter',
    'bluebird'
], function (XHRQ, jqAdapter, Promise) {
    var xhrq = new XHRQ(jqAdapter, Promise)
});
```

Then, start queuing requests as needed:

```javascript
xhrq.get('http://address.of.my.service').then(function (data) {
    // data is the JSON the service responded with
}).catch(function (err) {
    // Ooops!
})
```

## API

### RequestQueue(request, Promise, options)

Request queue constructor.

#### Params

*request* is the actual handler of the HTTP requests. It is a function that receives and object with the following properties:

  *type* of request as `GET`, `POST` or `DELETE`.
  *url* of the resource.
  *data* to send as object or `null` if none.
  *success* as `function(err, data)` to be called when the request completes.
  *error* as `function(err, code)` to be called with error and the HTTP code if the request cannot be fulfilled due to client (own) issues or with `err` as `null` if it should be retried.

*Promise* is an implementation of promises.

*options* is an object containing setup options. Supported options are:

  *retryTimeout* is the time to wait before retrying a single request.
  *maxRetries* is the maximum allowed retries for each request before failing.
  *strategy* is a function to select which requests to execute in each retry cycle. It defaults to executing all queued `GET` and `DELETE` in parallel and the `POST` in sequence. Other strategies are provided to execute all requests in parallel or in sequence in the `strategies` folder. Custom strategies can also be provided.

### RequestQueue.request(method, url, data, options)

Queues a request and retries its execution until is succeeds or fails due to a client error or the maximum attempts are reached.

#### Params

*method* can be `GET`, `POST` or `DELETE`. Other HTTP verbs are not currently supported but can easily be added to the private `_sendRequest` method. Proper handling in the underlying request mechanism is needed.

*url* of the resource.

*data* to send along with the request. It is expected to be a JSON object in the default implementation but can be changed as needed.

*options* to be passed to the underlying request handler.

#### Returns

A promise that will fulfill as the request is completed or fail otherwise.

### RequestQueue.get(url), RequestQueue.post(url, data), RequestQueue.delete(url)

Shorthand versions of `request()`.

### RequestQueue.onQueueLengthChange(callback)

Executes the callback any time the internal request queue's length changes.

#### Params

*callback* function to be called with the length of the request queue.

### RequestQueue.filter(test)

Allows to walk through the request queue to search for specific requests, i.e. when it is needed to check if a DELETE is still queued before queuing a GET.

#### Params

*test*  is a function to be called for each request in the queue. It wors exactly as `Array.prorotype.filter()` and returns the filtered array. Each request is an object having `method`, `url`, `data` and `options` properties.

### RequestQueue.length

Is the actual length of the queue.

## Testing

The functional tests are contained in the `test/index.html` page. The test suites are a mix of [Mocha](http://mochajs.org/) and [Chai](http://chaijs.com/).

Code coverage is supported using any version of [Blanket.js](http://blanketjs.org/) above v1.1.7 as the [patch](https://github.com/alex-seville/blanket/pull/499) for loading Blanket.js with RequireJS was added after that version. As that new version is not yet published, the code that invokes Blanket.js in the `specRunner.js` is commented out.

In addition, executing `npm install`, [serve](https://github.com/visionmedia/serve) a simple HTTP server and [mocha-phantomjs](http://metaskills.net/mocha-phantomjs/) are installed. Then, you can run `npm run serve` and then open `http://localhost:3000/test/index.html` in your browser or simply run `npm test` and run the test suites directly in the command line.

## License

WTFPL
