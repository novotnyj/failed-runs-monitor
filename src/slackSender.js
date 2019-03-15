const Slack = require('slack-node');
const { getRunUrl } = require('./utils');

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

function formatMessage(failedRuns) {
    let message = `<!channel> Found ${failedRuns.length} ${failedRuns.length === 1 ? 'actor' : 'actors'} with failed runs.\n\n`;
    for (const item of failedRuns) {
        if (item.failedRuns.length > 1) {
            message += `These runs have failed for actor "${item.name}":\n`;
        } else {
            message += `This run has failed for actor "${item.name}":\n`;
        }
        message += item.failedRuns.map((run) => `- <${getRunUrl(item.actorId, run.id)}|${run.id}>\n`);
        message += '\n';
    }

    return message;
}

module.exports = async (failedRuns, apiToken, channel) => {
    const slack = new Slack(apiToken);

    const text = formatMessage(failedRuns);

    await postMessage(slack, channel, text);
};
