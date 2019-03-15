const Apify = require('apify');
const failedRunsFinder = require('./failedRunsFinder');
const slackSender = require('./slackSender');
const mailSender = require('./mailSender');

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');

    const { actorIds, slackApiKey, slackChannel, emails, isEmptyDatasetFailed } = input;

    const failedRuns = await failedRunsFinder(actorIds, isEmptyDatasetFailed);
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
