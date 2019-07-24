const Apify = require('apify');
const failedRunsFinder = require('./failedRunsFinder');
const slackSender = require('./slackSender');
const mailSender = require('./mailSender');
const { getActor, getTask } = require('./utils');

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');
    const { config, slackApiKey, slackChannel, emails, schema, ignoreByInputMask, inputMask, resource, eventData } = input;

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
                return (item.acorId === actorId || item.acorId.includes(name));
            }
            if (item.taskId && taskName) {
                return item.taskId === actorTaskId || item.taskId.includes(taskName);
            }
        });
    }

    const failedRuns = await failedRunsFinder(actorConfigs || config, { schema, ignoreByInputMask, inputMask });
    await Apify.setValue('OUTPUT', failedRuns);
    if (failedRuns.length === 0) {
        console.log('Done.');
        return;
    }

    if (slackApiKey && slackChannel) {
        await slackSender(failedRuns, slackApiKey, slackChannel);
    }

    if (emails && emails.length > 0) {
        await mailSender(failedRuns, emails);
    }

    console.log('Done.');
});
