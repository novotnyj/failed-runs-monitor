const humanizeDuration = require('humanize-duration');
const { REASONS } = require('./const');

function getRunUrl(actId, runId) {
    return `https://my.apify.com/actors/${actId}#/runs/${runId}`;
}

function reasonToString(reason, actual, expected) {
    if (reason === REASONS.SMALL_DATASET) {
        return `More than ${expected} dataset items expected, ${actual} found`;
    }
    if (reason === REASONS.RUNNING_TOO_LONG) {
        const formattedExpected = humanizeDuration(expected, { largest: 2 });
        const formattedActual = humanizeDuration(actual, { largest: 2 });
        return `Should have finished in ${formattedExpected}, running for ${formattedActual} now`;
    }
    if (reason === REASONS.FAILED) {
        return 'Failed';
    }
    if (reason === REASONS.TIMEOUTED) {
        return 'Timed out';
    }

    throw new Error(`Unkown reason ${reason}`);
}

module.exports = { getRunUrl, reasonToString };
