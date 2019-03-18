const { REASONS } = require('./const');

function getRunUrl(actId, runId) {
    return `https://my.apify.com/actors/${actId}#/runs/${runId}`;
}

function reasonToString(reason) {
    if (reason === REASONS.EMPTY_DATASET) {
        return '0 items in dataset';
    }
    if (reason === REASONS.RUNNING_TOO_LONG) {
        return 'Running too long';
    }
    if (reason === REASONS.FAILED) {
        return 'Failed';
    }

    throw new Error(`Unkown reason ${reason}`);
}

module.exports = { getRunUrl, reasonToString };
