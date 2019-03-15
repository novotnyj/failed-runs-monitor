const Apify = require('apify');
const moment = require('moment');
const { REASONS } = require('./const');

const FAILED_STATUS = 'FAILED';
const SUCCESS_STATUS = 'SUCCEEDED';

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
            result.push({ ...run, reason: REASONS.EMPTY_DATASET });
        }
    }

    return result;
}

async function getFailedRuns({ client, actId, isEmptyDatasetFailed }) {
    const store = await Apify.openKeyValueStore('failed-runs-monitoring');
    const loadedLastRun = await store.getValue(actId);
    const lastRun = loadedLastRun ? moment(loadedLastRun) : moment();

    const { acts } = client;
    const failedRuns = [];
    let offset = 0;
    const limit = 100;

    const processRun = (run) => {
        if (run.status === FAILED_STATUS) {
            failedRuns.push({ ...run, reason: REASONS.FAILED });
        }
    };

    while (true) {
        const runs = await acts.listRuns({
            actId,
            desc: true,
            limit,
            offset,
        });
        const { items } = runs;
        if (items.length === 0) {
            break;
        }
        const interestingRuns = items.filter((run) => {
            return moment(run.finishedAt).isSameOrAfter(lastRun);
        });
        if (isEmptyDatasetFailed) {
            const emptyRuns = await findRunsWithEmptyDataset(client, interestingRuns);
            failedRuns.push(...emptyRuns);
        }
        const loadMore = interestingRuns.length === limit;
        interestingRuns.forEach(processRun);

        if (!loadMore) {
            break;
        }
        offset += limit;
    }

    await store.setValue(actId, moment().utc().toISOString());

    return failedRuns;
}

async function getActorName(client, actId) {
    const { acts } = client;
    const act = await acts.getAct({ actId });
    return act.name;
}

async function findFailedRuns(actorIds, isEmptyDatasetFailed = false) {
    const { client } = Apify;

    const failedRuns = {};
    for (const actId of actorIds) {
        const actorFailedRuns = await getFailedRuns({ client, actId, isEmptyDatasetFailed });
        if (actorFailedRuns.length === 0) {
            continue;
        }

        failedRuns[actId] = {
            failedRuns: actorFailedRuns,
            actorId: actId,
            name: await getActorName(client, actId),
        };
    }

    if (Object.keys(failedRuns).length === 0) {
        console.log('No failed runs!');
        return [];
    }

    return Object.values(failedRuns);
}

module.exports = findFailedRuns;
