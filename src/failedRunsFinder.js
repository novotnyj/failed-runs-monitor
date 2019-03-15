const Apify = require('apify');
const moment = require('moment');

async function getFailedRuns({ client, actId }) {
    const store = await Apify.openKeyValueStore('failed-runs-monitoring');
    const loadedLastRun = await store.getValue(actId);
    const lastRun = loadedLastRun ? moment(loadedLastRun) : moment();

    const { acts } = client;
    let failedRuns = [];
    let offset = 0;
    const limit = 100;
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
        const loadMore = !items.some((item) => {
            const finishedMoment = moment(item.finishedAt);
            return finishedMoment.isBefore(lastRun);
        });
        const failedItems = items.filter((item) => {
            const finishedMoment = moment(item.finishedAt);
            if (finishedMoment.isBefore(lastRun)) {
                return false;
            }

            return item.status === 'FAILED';
        });
        failedRuns = failedRuns.concat(failedItems);
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

async function findFailedRuns(actorIds) {
    const { client } = Apify;

    const failedRuns = {};
    for (const actId of actorIds) {
        const actorFailedRuns = await getFailedRuns({ client, actId });
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
