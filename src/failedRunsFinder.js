const Apify = require('apify');
const moment = require('moment');
const { REASONS } = require('./const');

// const { log } = Apify.utils;

const FAILED_STATUS = 'FAILED';
const SUCCESS_STATUS = 'SUCCEEDED';
const RUNNING_STATUS = 'RUNNING';

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

async function findRunningLongerThan(runs, timeout) {
    const result = [];
    for (const run of runs) {
        if (run.status !== RUNNING_STATUS) {
            continue;
        }

        const { startedAt } = run;
        const startedAtMoment = moment(startedAt);
        const expectedFinish = moment(startedAt).add(timeout, 'seconds');

        if (startedAtMoment.isAfter(expectedFinish)) {
            result.push({
                ...run,
                expected: timeout,
                actual: expectedFinish.utc().toNow() - startedAtMoment.utc().toNow(),
            });
        }
    }

    return result;
}

async function getFailedRuns({ client, config }) {
    const { actorId, isEmptyDatasetFailed, maxRunTimeSecs } = config;
    let { minDatasetItems } = config;

    // Backward compatibility, remove in future 2019-03-19
    if (isEmptyDatasetFailed && minDatasetItems === undefined) {
        minDatasetItems = 1;
    }

    const store = await Apify.openKeyValueStore('failed-runs-monitoring');
    const loadedLastRun = await store.getValue(actorId);
    const lastRun = loadedLastRun ? moment(loadedLastRun) : moment();

    const { acts } = client;
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
    };

    while (true) {
        const response = await acts.listRuns({
            actId: actorId,
            desc: true,
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
            const timeoutingRuns = await findRunningLongerThan(items, maxRunTimeSecs);
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

async function getActorName(client, actId) {
    const { acts } = client;
    const act = await acts.getAct({ actId });
    return act.name;
}

async function findFailedRuns(configs) {
    const { client } = Apify;

    const failedRuns = {};
    for (const config of configs) {
        if (!config.actorId) {
            throw new Error(`Missing "actorId" property in ${JSON.stringify(config)}`);
        }
        const actorFailedRuns = await getFailedRuns({ client, config });
        if (actorFailedRuns.length === 0) {
            continue;
        }

        const { actorId } = config;
        failedRuns[actorId] = {
            failedRuns: actorFailedRuns,
            actorId,
            name: await getActorName(client, actorId),
        };
    }

    if (Object.keys(failedRuns).length === 0) {
        console.log('No failed runs!');
        return [];
    }

    return Object.values(failedRuns);
}

module.exports = findFailedRuns;
