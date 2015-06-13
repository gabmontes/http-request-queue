define(function () {
    return function (queue, send) {
        // process all new and retrying requests
        queue.filter(function (req) {
            return !req.status.sent || req.status.retry;
        }).forEach(send);
    };
});
