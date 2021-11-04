const Slack = require('slack-node');
const { REASONS } = require('./const');
const { getRunUrl, reasonToSlackString } = require('./utils');

async function postMessage(slack, channel, text) {
    return new Promise((resolve, reject) => {
        slack.api('chat.postMessage', {
            text,
            channel,
        }, (err, response) => {
            if (err) {
                reject(err);
            } else {
                resolve(response);
            }
        });
    });
}

async function formatMessage(failedRuns, { smallDatasetNotifications }) {
    // Mention channel only if smallDatasetNotifications is true or some of the runs failed for other reason then SMALL_DATASET
    const mentionChannel = smallDatasetNotifications
        ? true
        : failedRuns.some(({ reason }) => reason !== REASONS.SMALL_DATASET);

    let message = `${mentionChannel ? '<!channel> ' : ''}`;
    message += `Found ${failedRuns.length} ${failedRuns.length === 1 ? 'actor/task' : 'actors/tasks'} with failed runs.\n\n`;
    const runFormatter = async (run, item) => {
        const { reason, actual, expected } = run;
        const reasonString = await reasonToSlackString(reason, actual, expected, run);
        const runUrl = await getRunUrl(item.actorId, item.taskId, run.id);
        return `- <${runUrl}|${run.id}>${reasonString !== '' ? ` (${reasonString})` : ''}`;
    };
    for (const item of failedRuns) {
        const objectName = item.taskId ? 'task' : 'actor';
        if (item.failedRuns.length > 1) {
            message += `These runs have failed for ${objectName} "${item.name}":\n`;
        } else {
            message += `This run has failed for ${objectName} "${item.name}":\n`;
        }
        for (const run of item.failedRuns) {
            message += `${await runFormatter(run, item)}\n`;
        }
        message += '\n';
    }

    return message;
}

module.exports = async (failedRuns, apiToken, channel, { smallDatasetNotifications }) => {
    const slack = new Slack(apiToken);

    const text = await formatMessage(failedRuns, { smallDatasetNotifications });

    return postMessage(slack, channel, text);
};
