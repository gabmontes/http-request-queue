define(function () {
    return function (queue, send) {
        // if any in the queue, run the first
        if (!queue.length) {
            return;
        }
        var req = queue[0];
        // if first is pending, wait
        if (req.status.pending) {
            return;
        }
        send(req);
    };
});
