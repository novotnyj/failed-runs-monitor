const Apify = require('apify');
const { Configuration } = require('apify/build/configuration');
const humanizeDuration = require('humanize-duration');
const { REASONS, validationErrorsKey } = require('./const');

const config = Configuration.getGlobalConfig();
const client = config.getClient();
const env = Apify.getEnv();

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

async function getRunUrl(actId, taskId, runId) {
    if (taskId) {
        const task = await getTask(taskId);
        return `https://console.apify.com/tasks/${task.id}#/runs/${runId}`;
    }
    const actor = await getActor(actId);
    return `https://console.apify.com/actors/${actor.id}#/runs/${runId}`;
}

function getValidationDetailsUrl(runId) {
    const { defaultKeyValueStoreId } = env;
    const key = validationErrorsKey(runId);
    return `https://api.apify.com/v2/key-value-stores/${defaultKeyValueStoreId}/records/${key}?disableRedirect=true`;
}

function reasonToString(reason, actual, expected) {
    if (reason === REASONS.SMALL_DATASET) {
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
        const link = getValidationDetailsUrl(run.id);
        return `<${link}|${actual} ${actual > 1 ? 'items' : 'item'}> did not match JSON schema`;
    }

    return reasonToString(reason, actual, expected);
}

async function reasonToEmailString(reason, actual, expected, run) {
    if (reason === REASONS.BAD_SCHEMA) {
        const link = getValidationDetailsUrl(run.id);
        return `<a href="${link}">${actual} ${actual > 1 ? 'items' : 'item'}</a> did not match JSON schema`;
    }

    return reasonToString(reason, actual, expected);
}

module.exports = { getRunUrl, reasonToString, reasonToSlackString, reasonToEmailString, getActor, getTask };
