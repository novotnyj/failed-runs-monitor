const Apify = require('apify');
const humanizeDuration = require('humanize-duration');
const { REASONS } = require('./const');

const { client } = Apify;
const { tasks, acts } = client;

const taskCache = {};
const actorCache = {};

async function getTask(taskId) {
    if (!taskCache[taskId]) {
        taskCache[taskId] = await tasks.getTask({ taskId });
    }
    return taskCache[taskId];
}

async function getActor(actId) {
    if (!actorCache[actId]) {
        actorCache[actId] = await acts.getAct({ actId });
    }

    return actorCache[actId];
}

async function getRunUrl(actId, taskId, runId) {
    if (taskId) {
        const task = await getTask(taskId);
        return `https://my.apify.com/tasks/${task.id}#/runs/${runId}`;
    }
    const actor = await getActor(actId);
    return `https://my.apify.com/actors/${actor.id}#/runs/${runId}`;
}

function reasonToString(reason, actual, expected) {
    if (reason === REASONS.SMALL_DATASET) {
        return `More than ${expected} dataset items expected, only ${actual} found`;
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

module.exports = { getRunUrl, reasonToString };
