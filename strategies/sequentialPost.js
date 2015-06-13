define(function () {
    return function (queue, send) {
        // send all but posts
        queue.filter(function (req) {
            return req.method !== 'POST';
        }).forEach(function (req) {
            if (!req.status.sent || req.status.retry) {
                send(req);
            }
        });
        // and send first post only
        var seqReqs = queue.filter(function (req) {
            return req.method === 'POST';
        });
        if (seqReqs.length && !seqReqs[0].status.pending) {
            send(seqReqs[0]);
        }
    };
});
