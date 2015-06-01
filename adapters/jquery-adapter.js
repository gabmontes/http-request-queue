define([
    'jquery'
], function (jQuery) {
    'use strict';

    return function (options) {

        // retain callbacks
        var successCb = options.success;
        var errorCb = options.error;

        // patch callbacks
        options.success = function (data, status) {
            successCb(status === 'success' ? null : new Error('Unexpected status ' + status), data);
        };
        options.error = function (xhr, status, error) {
            var serverError = xhr.status >= 500;
            var netError = xhr.status === 404 && xhr.statusText === 'error';
            var err = serverError || netError ? new Error('Request error ' + status  + '/' + error) : null;
            errorCb(err, xhr.status);
        };

        // format data
        options.contentType = options.contentType || (options.data ? 'application/json; charset=UTF-8' : null);
        options.data = JSON.stringify(options.data);

        // make request
        jQuery.ajax(options);
    };
});
