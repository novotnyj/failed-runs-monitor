const Apify = require('apify');
const failedRunsFinder = require('./failedRunsFinder');
const slackSender = require('./slackSender');
const mailSender = require('./mailSender');
const { getActor, getTask } = require('./utils');

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');
    const {
        config,
        slackApiKey,
        slackChannel,
        emails,
        schema,
        ignoreByInputMask,
        inputMask,
        resource,
        eventData,
        minDatasetItemsPercent,
        smallDatasetNotifications,
    } = input;

    const minDatasetItemsFactor = (minDatasetItemsPercent || 100) / 100;

    Apify.utils.log.info(`Using log level ${Apify.utils.log.getLevel()}`);

    let actorConfigs;
    if (resource && eventData) {
        const { actorId, actorTaskId } = eventData;
        const actor = await getActor(actorId);
        const { name } = actor;
        let taskName;
        if (actorTaskId) {
            const task = await getTask(actorTaskId);
            taskName = task.name;
        }

        actorConfigs = config.filter((item) => {
            if (item.actorId) {
                return (item.actorId === actorId || item.actorId.includes(name));
            }
            if (item.taskId && taskName) {
                return item.taskId === actorTaskId || item.taskId.includes(taskName);
            }
        });
        if (!actorConfigs) {
            const { minDatasetItems } = input;
            actorConfigs = actorTaskId
                ? [{ taskId: actorTaskId, minDatasetItems }]
                : [{ actorId, minDatasetItems }];
        }
    }

    const options = {
        schema,
        ignoreByInputMask,
        inputMask,
        minDatasetItemsFactor: minDatasetItemsFactor || 1,
    };
    let failedRuns = await failedRunsFinder(actorConfigs || config, options);
    await Apify.setValue('OUTPUT', failedRuns);
    if (failedRuns.length === 0) {
        console.log('Done.');
        return;
    }

    if (slackApiKey && slackChannel) {
        await slackSender(failedRuns, slackApiKey, slackChannel, { smallDatasetNotifications });
    }

    if (emails && emails.length > 0) {
        await mailSender(failedRuns, emails, { smallDatasetNotifications });
    }

    console.log('Done.');
});
