const Apify = require('apify');
const Ajv = require('ajv');
const { Configuration } = require('apify/build/configuration');
const { validationErrorsKey } = require('./const');

const ajv = new Ajv();
const config = Configuration.getGlobalConfig();
const client = config.getClient();

const { log } = Apify.utils;

async function datasetForEach(datasetId, itemCallback) {
    let offset = 0;
    const limit = 50000;

    while (true) {
        const page = await client.dataset(datasetId).listItems({ clean: true, offset, limit, skipHidden: true });
        offset += limit;
        const { items } = page;
        if (items.length === 0) break;
        for (const item of items) {
            await itemCallback(item);
        }
    }
}

async function checkRunSchema(run, validator) {
    const { defaultDatasetId, id } = run;
    const key = validationErrorsKey(id);
    const errors = [];
    let count = 0;
    await datasetForEach(defaultDatasetId, async (item) => {
        try {
            await validator(item);
            log.debug('Schema is valid', { item });
        } catch (e) {
            if (!(e instanceof Ajv.ValidationError)) throw e;

            const logItem = {
                datasetId: defaultDatasetId,
                item,
                errors: e.errors,
            };
            log.info('Schema check failed', logItem);
            errors.push(logItem);
            count++;
        }
    });

    if (errors.length > 0) {
        await Apify.setValue(key, errors);
    }

    return count;
}

async function checkSchema(runs, schema) {
    const result = [];
    schema.$async = true;
    const validator = ajv.compile(schema);

    const processRun = async (run) => {
        const count = await checkRunSchema(run, validator);
        if (count > 0) {
            result.push({
                ...run,
                expected: 0,
                actual: count,
            });
        }
    };

    let promises = [];
    for (const run of runs) {
        promises.push(processRun(run));
        if (promises.length > 2) {
            await Promise.all(promises);
            promises = [];
        }
    }
    await Promise.all(promises);

    return result;
}

module.exports = { checkSchema };
