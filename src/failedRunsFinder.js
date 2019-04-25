const Apify = require('apify');
const moment = require('moment');
const { ACT_JOB_STATUSES } = require('apify-shared/consts');
const { REASONS } = require('./const');

// const { log } = Apify.utils;

const FAILED_STATUS = ACT_JOB_STATUSES.FAILED;
const SUCCESS_STATUS = ACT_JOB_STATUSES.SUCCEEDED;
const RUNNING_STATUS = ACT_JOB_STATUSES.RUNNING;
const TIMEOUTED_STATUS = ACT_JOB_STATUSES.TIMED_OUT;

async function findRunsSmallDataset(client, runs, minDatasetItems) {
    const { datasets } = client;
    const result = [];
    for (const run of runs) {
        if (run.status !== SUCCESS_STATUS) {
            continue;
        }
        const { defaultDatasetId } = run;
        const dataset = await datasets.getDataset({ datasetId: defaultDatasetId });
        if (dataset.cleanItemCount < minDatasetItems) {
            result.push({
                ...run,
                expected: minDatasetItems,
                actual: dataset.cleanItemCount,
            });
        }
    }

    return result;
}

async function findRunningLongerThan(runs, timeout, store) {
    const result = [];
    for (const run of runs) {
        if (run.status !== RUNNING_STATUS) {
            continue;
        }

        const { id, startedAt } = run;
        const now = moment().utc();
        const startedAtMoment = moment(startedAt);
        const expectedFinish = moment(startedAt).add(timeout, 'seconds');

        if (now.isAfter(expectedFinish)) {
            const lastNoticedAt = await store.getValue(`${id}-long`);
            if (lastNoticedAt) {
                const lastNoticedMoment = moment(lastNoticedAt);
                const threeHoursAgo = moment().utc().subtract(3, 'hours');
                if (lastNoticedMoment.isAfter(threeHoursAgo)) {
                    continue;
                }
            }
            await store.setValue(`${id}-long`, moment().utc().toISOString());
            result.push({
                ...run,
                expected: timeout * 1000,
                actual: now.valueOf() - startedAtMoment.valueOf(),
            });
        }
    }

    return result;
}

async function getFailedRuns({ client, config }) {
    const { actorId, taskId, isEmptyDatasetFailed, maxRunTimeSecs } = config;
    let { minDatasetItems } = config;

    // Backward compatibility, remove in future 2019-03-19
    if (isEmptyDatasetFailed && minDatasetItems === undefined) {
        minDatasetItems = 1;
    }

    const store = await Apify.openKeyValueStore('failed-runs-monitoring');
    const loadedLastRun = await store.getValue(actorId);
    const lastRun = loadedLastRun ? moment(loadedLastRun) : moment();

    const { acts, tasks } = client;
    let endpoint;
    const options = { desc: true };
    if (taskId && !actorId) {
        endpoint = tasks;
        options.taskId = taskId;
    } else {
        endpoint = acts;
        options.actId = actorId;
    }
    const failedRuns = {};
    let offset = 0;
    const limit = 100;

    const processRun = (run, reason) => {
        failedRuns[run.id] = { ...run, reason };
    };

    const processFailedRun = (run) => {
        if (run.status === FAILED_STATUS) {
            processRun(run, REASONS.FAILED);
        }
        if (run.status === TIMEOUTED_STATUS) {
            processRun(run, REASONS.TIMEOUTED);
        }
    };

    while (true) {
        const response = await endpoint.listRuns({
            ...options,
            limit,
            offset,
        });
        const { items } = response;
        if (items.length === 0) {
            break;
        }
        const finishedRuns = items.filter((run) => {
            return run.finishedAt && moment(run.finishedAt).isSameOrAfter(lastRun);
        });
        if (minDatasetItems && minDatasetItems > 0) {
            const emptyRuns = await findRunsSmallDataset(client, finishedRuns, minDatasetItems);
            emptyRuns.forEach((run) => processRun(run, REASONS.SMALL_DATASET));
        }
        if (maxRunTimeSecs !== undefined && maxRunTimeSecs > 0) {
            const timeoutingRuns = await findRunningLongerThan(items, maxRunTimeSecs, store);
            timeoutingRuns.forEach((run) => processRun(run, REASONS.RUNNING_TOO_LONG));
        }
        const loadMore = finishedRuns.length === limit;
        finishedRuns.forEach(processFailedRun);

        if (!loadMore) {
            break;
        }
        offset += limit;
    }

    await store.setValue(actorId, moment().utc().toISOString());

    return Object.values(failedRuns);
}

async function getObjectName(client, actId, taskId) {
    const { acts, tasks } = client;
    if (actId) {
        const act = await acts.getAct({ actId });
        return act.name;
    }
    if (taskId) {
        const task = await tasks.getTask({ taskId });
        return task.name;
    }
}

async function findFailedRuns(configs) {
    const { client } = Apify;

    const failedRuns = {};
    for (const config of configs) {
        if (!config.actorId || !config.taskId) {
            throw new Error(`Missing "actorId" or "taskId" property in ${JSON.stringify(config)}`);
        }
        if (config.actorId && config.taskId) {
            throw new Error(`Cannot use both "actorId" and "taskId" in ${JSON.stringify(config)}`);
        }
        const actorFailedRuns = await getFailedRuns({ client, config });
        if (actorFailedRuns.length === 0) {
            continue;
        }

        const { actorId, taskId } = config;
        failedRuns[actorId] = {
            failedRuns: actorFailedRuns,
            actorId,
            taskId,
            name: await getObjectName(client, actorId),
            checkedAt: moment().toISOString(),
        };
    }

    if (Object.keys(failedRuns).length === 0) {
        console.log('No failed runs!');
        return [];
    }

    return Object.values(failedRuns);
}

module.exports = findFailedRuns;
