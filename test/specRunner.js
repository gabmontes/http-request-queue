require.config({
    baseUrl: '..',
    paths: {
        'blanket': 'bower_components/blanket/dist/mocha/blanket_mocha',
        'chai': 'bower_components/chai/chai',
        'jquery': 'bower_components/jquery/dist/jquery',
        'mocha': 'bower_components/mocha/mocha'
    },
    shim: {
        'blanket': {
            deps: ['mocha']
        }
    }
});

require([
    'mocha',
    // 'blanket'
], function () {
    'use strict';

    mocha.setup('tdd');

    /* blanket.options({
        antifilter: '[bower_components/,test/]',
        branchTracking: true
    }); */

    require([
        'test/test'
    ], function () {
        mocha.run();
    });
});
