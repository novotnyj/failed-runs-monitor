const Slack = require('slack-node');
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

async function formatMessage(failedRuns) {
    let message = `<!channel> Found ${failedRuns.length} ${failedRuns.length === 1 ? 'actor/task' : 'actors/tasks'} with failed runs.\n\n`;
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

module.exports = async (failedRuns, apiToken, channel) => {
    const slack = new Slack(apiToken);

    const text = await formatMessage(failedRuns);

    return postMessage(slack, channel, text);
};
