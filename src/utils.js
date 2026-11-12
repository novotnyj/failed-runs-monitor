const { Actor } = require('apify');
const humanizeDuration = require('humanize-duration');
const { REASONS, validationErrorsKey } = require('./const');

const client = Actor.apifyClient;

const taskCache = {};
const actorCache = {};

async function getTask(taskId) {
    if (!taskCache[taskId]) {
        taskCache[taskId] = await client.task(taskId).get();
    }
    return taskCache[taskId];
}

async function getActor(actId) {
    if (!actorCache[actId]) {
        actorCache[actId] = await client.actor(actId).get();
    }

    return actorCache[actId];
}

function getRunUrl(run) {
    return `https://console.apify.com/actors/${run.actId}/runs/${run.id}`;
}

async function getValidationDetailsUrl(runId) {
    const store = await Actor.openKeyValueStore();
    return store.getPublicUrl(validationErrorsKey(runId));
}

function reasonToString(reason, actual, expected) {
    if (reason === REASONS.SMALL_DATASET || reason === REASONS.EMPTY_DATASET) {
        return `More than ${expected} dataset items expected, ${actual > 0 ? `only ${actual}` : '0'} found`;
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
    if (reason === REASONS.BAD_SCHEMA) {
        return `${actual} ${actual > 1 ? 'items' : 'item'} did not match JSON schema`;
    }

    throw new Error(`Unkown reason ${reason}`);
}

async function reasonToSlackString(reason, actual, expected, run) {
    if (reason === REASONS.BAD_SCHEMA) {
        const link = await getValidationDetailsUrl(run.id);
        return `<${link}|${actual} ${actual > 1 ? 'items' : 'item'}> did not match JSON schema`;
    }

    return reasonToString(reason, actual, expected);
}

async function reasonToEmailString(reason, actual, expected, run) {
    if (reason === REASONS.BAD_SCHEMA) {
        const link = await getValidationDetailsUrl(run.id);
        return `<a href="${link}">${actual} ${actual > 1 ? 'items' : 'item'}</a> did not match JSON schema`;
    }

    return reasonToString(reason, actual, expected);
}

module.exports = { getRunUrl, reasonToString, reasonToSlackString, reasonToEmailString, getActor, getTask };
