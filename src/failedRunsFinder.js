const Apify = require('apify');
const { Configuration } = require('apify/build/configuration');
const moment = require('moment');
const _ = require('lodash');
const { ACT_JOB_STATUSES } = require('apify-shared/consts');
const { REASONS } = require('./const');
const { checkSchema } = require('./schemaChecker');

const { log } = Apify.utils;
const config = Configuration.getGlobalConfig();
const client = config.getClient();

const FAILED_STATUS = ACT_JOB_STATUSES.FAILED;
const SUCCESS_STATUS = ACT_JOB_STATUSES.SUCCEEDED;
const RUNNING_STATUS = ACT_JOB_STATUSES.RUNNING;
const TIMEOUTED_STATUS = ACT_JOB_STATUSES.TIMED_OUT;

/**
 * Finds runs where default dataset.cleanItemCount is lower than minDatasetItems
 *
 * @param {[Object]} runs - List of runs to check
 * @param {Number} minDatasetItems - minimal count of items that should be in dataset
 * @returns {[Object]} - list of runs where dataset was smaller then minDatasetItems
 */
async function findRunsSmallDataset(runs, minDatasetItems) {
    const result = [];
    for (const run of runs) {
        // Run hasn't succeeded - could still be running, or failed/timeouted
        if (run.status !== SUCCESS_STATUS) continue;

        const dataset = await client.dataset(run.defaultDatasetId).get();
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

/**
 * Finds all runs that are running for more than timeoutSecs
 *
 * @param {[Object]} runs
 * @param {Number} timeoutSecs
 * @param {Object} contextStore
 * @returns
 */
async function findRunningLongerThan(runs, timeoutSecs, contextStore) {
    const result = [];
    for (const run of runs) {
        // Run is no longer running, no need to check it
        if (run.status !== RUNNING_STATUS) continue;

        const { id, startedAt } = run;
        const now = moment().utc();
        const startedAtMoment = moment(startedAt);
        const expectedFinish = moment(startedAt).add(timeoutSecs, 'seconds');

        if (now.isAfter(expectedFinish)) {
            const lastNoticedAt = await contextStore.getValue(`${id}-long`);
            if (lastNoticedAt) {
                const lastNoticedMoment = moment(lastNoticedAt);
                const threeHoursAgo = moment().utc().subtract(3, 'hours');
                if (lastNoticedMoment.isAfter(threeHoursAgo)) continue;
            }

            await contextStore.setValue(`${id}-long`, moment().utc().toISOString());

            result.push({
                ...run,
                expected: timeoutSecs * 1000,
                actual: now.valueOf() - startedAtMoment.valueOf(),
            });
        }
    }

    return result;
}

/**
 *
 * @param {*} storeId
 * @param {*} key
 * @returns
 */
async function getRecordWithRetry(storeId, key) {
    let lastError;
    for (let i = 1; i < 5; i++) {
        try {
            const result = await client.keyValueStore(storeId).getRecord(key);
            return result.value;
        } catch (e) {
            lastError = e;
            await Apify.utils.sleep(200 * (2 ** i));
        }
    }

    throw lastError;
}

async function filterRunsByInputMask(runs, inputMask, ignoreByInputMask) {
    const filteredRuns = [];
    for (const run of runs) {
        const { defaultKeyValueStoreId } = run;
        let actorInput;
        try {
            actorInput = await getRecordWithRetry(defaultKeyValueStoreId, 'INPUT');
        } catch (e) {
            // Most likely invalid input, we should check this run...
            log.exception(e, 'Run with invalid input?', { run });
            filteredRuns.push(run);
            continue;
        }
        if (!actorInput) {
            // No input and we have mask - ignore it
            log.debug('No input', { run });
            continue;
        }
        const { body } = actorInput;
        let shouldBeSkipped = false;
        for (const key of Object.keys(inputMask)) {
            const contains = actorInput[key] && _.isEqual(actorInput[key], inputMask[key]);
            if (contains && ignoreByInputMask) {
                shouldBeSkipped = true;
                log.debug(`Will skip run ${run.id} because of ignored input`, {
                    actorInput,
                    inputMask,
                });
                break;
            }
            if (!contains && !ignoreByInputMask) {
                shouldBeSkipped = true;
                log.debug(`Will skip run ${run.id} because of not matched input mask`, {
                    actorInput,
                    inputMask,
                });
                break;
            }
        }
        if (!shouldBeSkipped) {
            log.debug(`Will not skip run ${run.id}`, {
                actorInput,
                inputMask,
            });
            filteredRuns.push(run);
        }
    }
    return filteredRuns;
}

async function getFailedRuns({ config, options }) {
    const { actorId, taskId, isEmptyDatasetFailed, maxRunTimeSecs } = config;
    let { inputMask, schema, ignoreByInputMask } = config;
    if (!inputMask && options.inputMask) {
        ({ inputMask } = options);
    }
    if (!schema && options.schema) {
        ({ schema } = options);
    }
    if (!ignoreByInputMask && options.ignoreByInputMask) {
        ({ ignoreByInputMask } = options);
    }
    let { minDatasetItems } = config;

    // Backward compatibility, remove in future 2019-03-19
    if (isEmptyDatasetFailed && minDatasetItems === undefined) {
        minDatasetItems = 1;
    }

    const env = await Apify.getEnv();
    const { actorTaskId } = env;
    const store = await Apify.openKeyValueStore(`failed-runs-monitoring${actorTaskId ? `-${actorTaskId}` : ''}`);
    const lastRunKey = taskId ? `task-${taskId.replace('/', '_')}` : actorId.replace('/', '_');
    const loadedLastRun = await store.getValue(lastRunKey);

    const lastRun = loadedLastRun ? moment(loadedLastRun) : moment().subtract(7, 'days');

    log.info(`Looking for failed runs since ${lastRun.toISOString()}`, { actorId, taskId });

    const endpoint = taskId && !actorId ? client.task(taskId) : client.actor(actorId);
    const failedRuns = {};
    let offset = 0;
    const limit = 100;

    const processRun = (run, reason) => {
        failedRuns[run.id] = { ...run, reason };
    };

    const processFailedRun = (run) => {
        if (run.status === FAILED_STATUS) processRun(run, REASONS.FAILED);
        if (run.status === TIMEOUTED_STATUS) processRun(run, REASONS.TIMEOUTED);
    };

    while (true) {
        const list = await endpoint.runs().list({
            desc: true,
            limit,
            offset,
        });
        const { items } = list;
        if (items.length === 0) {
            break;
        }

        let finishedRuns = items.filter((run) => {
            return run.finishedAt && moment(run.finishedAt).isSameOrAfter(lastRun);
        });

        log.debug(`Found ${finishedRuns.length} finished runs`);
        if (inputMask) {
            finishedRuns = await filterRunsByInputMask(finishedRuns, inputMask, ignoreByInputMask);
        }

        // Checks if datasets are not small
        if (minDatasetItems && minDatasetItems > 0) {
            const emptyRuns = await findRunsSmallDataset(finishedRuns, minDatasetItems);
            emptyRuns.forEach((run) => processRun(run, REASONS.SMALL_DATASET));
        }

        // This will find long running runs and adds them to failed
        if (maxRunTimeSecs !== undefined && maxRunTimeSecs > 0) {
            const timeoutingRuns = await findRunningLongerThan(items, maxRunTimeSecs, store);
            timeoutingRuns.forEach((run) => processRun(run, REASONS.RUNNING_TOO_LONG));
        }

        const loadMore = finishedRuns.length === limit;

        // This will add failed and timeouted runs to failed list
        finishedRuns.forEach(processFailedRun);

        // check schema
        if (schema) {
            const failedRunsArray = Object.values(failedRuns);
            const runsToCheck = finishedRuns.filter((run) => !failedRunsArray.find((item) => item.id === run.id));
            const badSchema = await checkSchema(runsToCheck, schema);
            badSchema.forEach((run) => processRun(run, REASONS.BAD_SCHEMA));
        }

        if (!loadMore) {
            break;
        }
        offset += limit;
    }

    await store.setValue(lastRunKey, moment().utc().toISOString());

    return Object.values(failedRuns);
}

/**
 * Returns name of task or actor if taskId is null
 *
 * @param {String|null} actId
 * @param {String|null} taskId
 * @returns {String}
 */
async function getObjectName(actorId, taskId) {
    const item = taskId
        ? await client.task(taskId).get()
        : await client.actor(actorId).get();
    return item.name;
}

async function findFailedRuns(configs, options) {
    const tmpKey = 'FAILED_RUNS_TMP';
    const failedRuns = await Apify.getValue(tmpKey) || {};

    let migrating = false;
    Apify.events.on('migrating', () => {
        migrating = true;
    });

    for (const config of configs) {
        if (migrating) {
            log.info('Waiting for migration to happen...');
            await Apify.utils.sleep(10 * 60 * 1000);
        }
        if (!config.actorId && !config.taskId) {
            throw new Error(`Missing "actorId" or "taskId" property in ${JSON.stringify(config)}`);
        }
        if (config.actorId && config.taskId) {
            throw new Error(`Cannot use both "actorId" and "taskId" in ${JSON.stringify(config)}`);
        }
        const actorFailedRuns = await getFailedRuns({ config, options });
        if (actorFailedRuns.length === 0) continue;

        const { actorId, taskId } = config;
        failedRuns[actorId || taskId] = {
            failedRuns: actorFailedRuns,
            actorId,
            taskId,
            name: await getObjectName(actorId, taskId),
            checkedAt: moment().toISOString(),
        };
        await Apify.setValue(tmpKey, failedRuns);
    }

    if (Object.keys(failedRuns).length === 0) {
        console.log('No failed runs!');
        return [];
    }

    return Object.values(failedRuns);
}

module.exports = findFailedRuns;
