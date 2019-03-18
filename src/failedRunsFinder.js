const Apify = require('apify');
const moment = require('moment');
const { REASONS } = require('./const');

const FAILED_STATUS = 'FAILED';
const SUCCESS_STATUS = 'SUCCEEDED';
const RUNNING_STATUS = 'RUNNING';

async function findRunsWithEmptyDataset(client, runs) {
    const { datasets } = client;
    const result = [];
    for (const run of runs) {
        if (run.status !== SUCCESS_STATUS) {
            continue;
        }
        const { defaultDatasetId } = run;
        const dataset = await datasets.getDataset({ datasetId: defaultDatasetId });
        if (dataset.cleanItemCount === 0) {
            result.push(run);
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
            result.push(run);
        }
    }

    return result;
}

async function getFailedRuns({ client, actor }) {
    const { actorId, isEmptyDatasetFailed, maxRunTimeSecs } = actor;
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
        if (isEmptyDatasetFailed) {
            const emptyRuns = await findRunsWithEmptyDataset(client, finishedRuns);
            emptyRuns.forEach((run) => processRun(run, REASONS.EMPTY_DATASET));
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

async function findFailedRuns(actors) {
    const { client } = Apify;

    const failedRuns = {};
    for (const actor of actors) {
        const actorFailedRuns = await getFailedRuns({ client, actor });
        if (actorFailedRuns.length === 0) {
            continue;
        }

        const { actorId } = actor;
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
